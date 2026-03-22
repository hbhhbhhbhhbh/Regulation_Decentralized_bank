// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./IdentityRegistry.sol";
import "./RiskEngine.sol";
import "./ComplianceLog.sol";

/**
 * @title BankVault
 * @dev SafeHarbor 金库：KYC + CDD + AML 统一接入点。
 * 为了减少依赖并避免版本差异，这里不再继承 OpenZeppelin 的 ReentrancyGuard/Pausable，
 * 而是提供一个简单的 pause 标志与修饰器，演示逻辑保持不变。
 */
contract BankVault is AccessControl {
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    IERC20 public immutable token;
    IdentityRegistry public immutable identity;
    RiskEngine public immutable riskEngine;
    ComplianceLog public immutable logContract;

    uint256 public constant TEN_K = 10_000 * 1e18;
    uint256 public frequencyWindow = 60;
    uint256 public maxTxPerWindow = 3;
    uint256 public lockDuration = 1 hours;

    /// @dev 银行内部 sUSD 账本余额（不等于用户钱包中的代币余额）
    mapping(address => uint256) public balances;

    struct DailyStats {
        uint256 day;
        uint256 spent;
    }
    mapping(address => DailyStats) public dailyStats;

    struct FrequencyStats {
        uint256 windowStart;
        uint256 count;
    }
    mapping(address => FrequencyStats) public freqStats;

    mapping(address => uint256) public lockedUntil;
    mapping(address => bool) public blacklisted;

    enum EscrowStatus {
        Pending,
        Approved,
        Rejected
    }

    enum LoanStatus {
        Pending,
        Approved,
        Rejected
    }

    enum RedeemStatus {
        Pending,
        Approved,
        Rejected
    }

    struct EscrowTransfer {
        address from;
        address to;
        uint256 amount;
        EscrowStatus status;
        uint256 createdAt;
        uint256 approvals;
        mapping(address => bool) approvedBy;
    }

    uint256 public nextCaseId = 1;
    mapping(uint256 => EscrowTransfer) private escrows;

    /// @dev 外部币赎回申请自增 ID
    uint256 public nextRedeemId = 1;

    // 合约自身持有的原生 ETH 作为银行外币储备。

    /// @dev 每 1 sUSD 对应的 ETH 数量（18 位小数），由管理员根据汇率更新。
    uint256 public ethPerSUSDE18;

    struct LoanCase {
        address borrower;
        uint256 principal;
        uint256 rateBps;
        LoanStatus status;
        uint256 createdAt;
        uint256 approvals;
        mapping(address => bool) approvedBy;
    }

    uint256 public nextLoanId = 1;
    mapping(uint256 => LoanCase) private loanCases;
    uint256 public totalDepositsSusd; 
    uint256 public totalBorrowedSusd;

    struct RedeemCase {
        address user;
        string assetSymbol;
        uint256 susdAmount;
        uint256 ethAmount;
        RedeemStatus status;
        uint256 createdAt;
        uint256 approvals;
        mapping(address => bool) approvedBy;
    }

    mapping(uint256 => RedeemCase) private redeemCases;

    bool public paused;

    /// @dev 存款年化利率 (bps)，对外展示用；管理员可调
    uint256 public depositApyBps = 200;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event ImmediateTransfer(address indexed from, address indexed to, uint256 amount);
    event EscrowCreated(uint256 indexed caseId, address indexed from, address indexed to, uint256 amount);
    event EscrowApproved(uint256 indexed caseId, address indexed from, address indexed to, uint256 amount);
    event EscrowRejected(uint256 indexed caseId, address indexed from, address indexed to, uint256 amount, string reason);
    event LoanRequested(uint256 indexed loanId, address indexed borrower, uint256 principal, uint256 rateBps);
    event LoanApproved(uint256 indexed loanId, address indexed borrower, uint256 principal);
    event LoanRejected(uint256 indexed loanId, address indexed borrower, uint256 principal, string reason);
    event LoanRepaid(address indexed borrower, uint256 amount);

    /// @dev 用户申请将银行 sUSD 余额赎回为某种外部资产（实际兑付由银行后台处理）
    event RedeemRequested(
        uint256 indexed redeemId,
        address indexed user,
        string assetSymbol,
        uint256 susdAmount
    );
    event RedeemApproved(uint256 indexed redeemId, address indexed user, uint256 susdAmount, uint256 ethAmount);
    event RedeemRejected(uint256 indexed redeemId, address indexed user, uint256 susdAmount, string reason);

    constructor(
        IERC20 _token,
        IdentityRegistry _identity,
        RiskEngine _risk,
        ComplianceLog _log
    ) {
        token = _token;
        identity = _identity;
        riskEngine = _risk;
        logContract = _log;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    /// @dev 允许直接向合约转入原生 ETH 作为银行外币储备。
    receive() external payable {}

    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, msg.sender), "not admin");
        _;
    }

    modifier onlyCompliantUser() {
        require(identity.hasValidSBT(msg.sender), "KYC/SBT required");
        require(!blacklisted[msg.sender], "blacklisted");
        require(block.timestamp >= lockedUntil[msg.sender], "account locked");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "paused");
        _;
    }

    function deposit(uint256 amount) external whenNotPaused onlyCompliantUser {
        require(amount > 0, "amount=0");
        balances[msg.sender] += amount;
        require(token.transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        emit Deposited(msg.sender, amount);
    }

    /// @notice 用户以原生 ETH 存入银行，前端按汇率换算出应记入的 sUSD 数量。
    /// @param susdAmount 前端根据 ETH 数量与实时价格计算出的 sUSD 数量（18 位小数）。
    function depositFromExternal(uint256 susdAmount) external payable whenNotPaused onlyCompliantUser {
        require(msg.value > 0, "eth=0");
        require(susdAmount > 0, "susd=0");
        balances[msg.sender] += susdAmount;
        totalDepositsSusd += susdAmount;
        emit Deposited(msg.sender, susdAmount);
    }

    function withdraw(uint256 amount) external whenNotPaused onlyCompliantUser {
        require(amount > 0, "amount=0");
        require(balances[msg.sender] >= amount, "insufficient");
        balances[msg.sender] -= amount;
        require(token.transfer(msg.sender, amount), "transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    function transfer(address to, uint256 amount)
        external
        whenNotPaused
        onlyCompliantUser
    {
        require(to != address(0), "invalid to");
        require(amount > 0, "amount=0");
        require(!blacklisted[to], "recipient blacklisted");

        _applyFrequencyChecks(msg.sender);
        _applyDailyLimitAndPotentialEscrow(msg.sender, to, amount);
    }

    function internalTransfer(address from, address to, uint256 amount) internal {
        require(balances[from] >= amount, "insufficient");
        balances[from] -= amount;
        balances[to] += amount;
        emit ImmediateTransfer(from, to, amount);
    }

    function _applyFrequencyChecks(address user) internal {
        FrequencyStats storage f = freqStats[user];
        uint256 nowTs = block.timestamp;

        if (nowTs > f.windowStart + frequencyWindow) {
            f.windowStart = nowTs;
            f.count = 1;
        } else {
            f.count += 1;
        }

        if (f.count > maxTxPerWindow) {
            lockedUntil[user] = nowTs + lockDuration;
            logContract.emitAMLAlert(user, "FREQUENCY", "Too many transfers in short window");
            logContract.emitAccountLocked(user, lockedUntil[user], "Frequency breach");
        }
    }

    function _applyDailyLimitAndPotentialEscrow(
        address from,
        address to,
        uint256 amount
    ) internal {
        DailyStats storage ds = dailyStats[from];
        uint256 today = block.timestamp / 1 days;
        if (ds.day != today) {
            ds.day = today;
            ds.spent = 0;
        }

        uint256 userLimit = riskEngine.getDailyLimit(from);
        bool breachDaily = (ds.spent + amount > userLimit);
        bool isLargeTx = amount >= TEN_K;

        if (breachDaily || isLargeTx) {
            uint256 caseId = _createEscrow(from, to, amount, breachDaily, isLargeTx);
            ds.spent += amount;
            logContract.emitTransferRequested(caseId, from, to, amount);
        } else {
            ds.spent += amount;
            internalTransfer(from, to, amount);
        }
    }

    function _createEscrow(
        address from,
        address to,
        uint256 amount,
        bool breachDaily,
        bool isLargeTx
    ) internal returns (uint256 caseId) {
        require(balances[from] >= amount, "insufficient");

        balances[from] -= amount;

        caseId = nextCaseId++;
        EscrowTransfer storage e = escrows[caseId];
        e.from = from;
        e.to = to;
        e.amount = amount;
        e.status = EscrowStatus.Pending;
        e.createdAt = block.timestamp;

        string memory reason = breachDaily
            ? "DAILY_LIMIT"
            : (isLargeTx ? "LARGE_TX" : "OTHER");

        emit EscrowCreated(caseId, from, to, amount);
        logContract.emitTransferEscrowed(caseId, from, to, amount, reason);
        logContract.emitAMLAlert(from, reason, "Escrowed for manual review");
    }

    function approveEscrow(uint256 caseId) external whenNotPaused onlyRole(AUDITOR_ROLE) {
        EscrowTransfer storage e = escrows[caseId];
        require(e.status == EscrowStatus.Pending, "not pending");
        require(!e.approvedBy[msg.sender], "already approved");

        e.approvedBy[msg.sender] = true;
        e.approvals += 1;

        logContract.emitTransferApproved(caseId, msg.sender);

        if (e.approvals >= 2) {
            e.status = EscrowStatus.Approved;
            balances[e.to] += e.amount;
            emit EscrowApproved(caseId, e.from, e.to, e.amount);
        }
    }

    function rejectEscrow(uint256 caseId, string calldata reason)
        external
        whenNotPaused
        onlyRole(AUDITOR_ROLE)
    {
        EscrowTransfer storage e = escrows[caseId];
        require(e.status == EscrowStatus.Pending, "not pending");

        e.status = EscrowStatus.Rejected;
        balances[e.from] += e.amount;

        // 将被托管占用的当日额度归还给用户
        DailyStats storage ds = dailyStats[e.from];
        uint256 today = block.timestamp / 1 days;
        if (ds.day != today) {
            ds.day = today;
            ds.spent = 0;
        } else {
            if (ds.spent >= e.amount) {
                ds.spent -= e.amount;
            } else {
                ds.spent = 0;
            }
        }

        emit EscrowRejected(caseId, e.from, e.to, e.amount, reason);
        logContract.emitTransferRejected(caseId, msg.sender, reason);
    }

    /// @dev 供审计员前端拉取托管单详情（含待审批列表）。
    function getEscrow(uint256 caseId)
        external
        view
        returns (address from_, address to_, uint256 amount_, EscrowStatus status_, uint256 createdAt_, uint256 approvals_)
    {
        if (caseId == 0 || caseId >= nextCaseId) {
            return (address(0), address(0), 0, EscrowStatus.Rejected, 0, 0);
        }
        EscrowTransfer storage e = escrows[caseId];
        return (e.from, e.to, e.amount, e.status, e.createdAt, e.approvals);
    }

    /// @dev 供审计员前端拉取借贷工单详情。
    function getLoanCase(uint256 loanId)
        external
        view
        returns (address borrower_, uint256 principal_, uint256 rateBps_, LoanStatus status_, uint256 createdAt_, uint256 approvals_)
    {
        if (loanId == 0 || loanId >= nextLoanId) {
            return (address(0), 0, 0, LoanStatus.Rejected, 0, 0);
        }
        LoanCase storage lc = loanCases[loanId];
        return (lc.borrower, lc.principal, lc.rateBps, lc.status, lc.createdAt, lc.approvals);
    }

    /// @dev 供审计员/用户前端拉取赎回工单详情。
    function getRedeemCase(uint256 redeemId)
        external
        view
        returns (
            address user_,
            string memory assetSymbol_,
            uint256 susdAmount_,
            uint256 ethAmount_,
            RedeemStatus status_,
            uint256 createdAt_,
            uint256 approvals_
        )
    {
        if (redeemId == 0 || redeemId >= nextRedeemId) {
            return (address(0), "", 0, 0, RedeemStatus.Rejected, 0, 0);
        }
        RedeemCase storage rc = redeemCases[redeemId];
        return (rc.user, rc.assetSymbol, rc.susdAmount, rc.ethAmount, rc.status, rc.createdAt, rc.approvals);
    }

    function setBlacklist(address user, bool isBlacklisted_) external onlyAdmin {
        blacklisted[user] = isBlacklisted_;
        logContract.emitBlacklistUpdated(user, isBlacklisted_);
    }

    function forceLockAccount(address user, uint256 until, string calldata reason) external onlyAdmin {
        lockedUntil[user] = until;
        logContract.emitAccountLocked(user, until, reason);
    }

    function unlockAccount(address user) external onlyAdmin {
        lockedUntil[user] = 0;
        logContract.emitAccountUnlocked(user);
    }

    function addAuditor(address auditor) external onlyAdmin {
        _grantRole(AUDITOR_ROLE, auditor);
        logContract.emitAuditorAdded(auditor);
    }

    function removeAuditor(address auditor) external onlyAdmin {
        _revokeRole(AUDITOR_ROLE, auditor);
        logContract.emitAuditorRemoved(auditor);
    }

    function requestLoan(uint256 principal) external whenNotPaused onlyCompliantUser {
        require(principal > 0, "principal=0");

        // --- 风控防线 1：系统流动性枯竭保护 ---
        // 确保本次借出后，系统的资金利用率不会超过 90%
        require(
            totalDepositsSusd == 0 || 
            ((totalBorrowedSusd + principal) * 1e18 / totalDepositsSusd) <= (0.9 * 1e18), 
            "Risk: System liquidity utilization too high"
        );

        // --- 风控防线 2：个人抵押率/杠杆保护 ---
        // 要求用户自身的 sUSD 余额至少是借款金额的 50%（作为隐性抵押）
        require(balances[msg.sender] >= principal / 2, "Risk: Insufficient balance for collateral");

        // 借贷额度控制：使用风险引擎的日限额作为简单的“最高可借本金”
        uint256 loanLimit = riskEngine.getDailyLimit(msg.sender);
        require(principal <= loanLimit, "loan limit exceeded");

        // 为所有借贷创建审核工单，供审计员审批
        uint256 loanId = nextLoanId++;
        LoanCase storage lc = loanCases[loanId];
        lc.borrower = msg.sender;
        lc.principal = principal;
        
        // --- 对接新版利率模型 ---
        // 传入当前全局的 借出总额 和 存款总额 计算动态利率
        lc.rateBps = riskEngine.getInterestRateBps(msg.sender, totalBorrowedSusd, totalDepositsSusd);
        
        lc.status = LoanStatus.Pending;
        lc.createdAt = block.timestamp;

        // 大额借贷触发 AML 审计提示
        if (principal >= TEN_K) {
            logContract.emitAMLAlert(msg.sender, "LARGE_LOAN", "Large loan request for manual review");
        }

        emit LoanRequested(loanId, msg.sender, principal, lc.rateBps);
    }

    function repayLoan(uint256 amount) external whenNotPaused onlyCompliantUser {
        require(amount > 0, "amount=0");
        require(token.transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        totalBorrowedSusd -= amount;
        emit LoanRepaid(msg.sender, amount);
    }

    function approveLoan(uint256 loanId, uint256 ethAmount) external whenNotPaused onlyRole(AUDITOR_ROLE) {
        LoanCase storage lc = loanCases[loanId];
        require(lc.borrower != address(0), "loan not found");
        require(lc.status == LoanStatus.Pending, "not pending");
        require(!lc.approvedBy[msg.sender], "already approved");
        require(ethAmount > 0, "eth=0");

        lc.approvedBy[msg.sender] = true;
        lc.approvals += 1;

        if (lc.approvals >= 2) {
            lc.status = LoanStatus.Approved;
            // 将批准的借贷本金记入用户的银行 sUSD 账户余额
            balances[lc.borrower] += lc.principal;

            totalDepositsSusd += lc.principal; 
            totalBorrowedSusd += lc.principal;

            require(address(this).balance >= ethAmount, "insufficient ETH reserve");
            (bool ok, ) = lc.borrower.call{value: ethAmount}("");
            require(ok, "ETH transfer failed");
            emit LoanApproved(loanId, lc.borrower, lc.principal);
        }
    }

    function rejectLoan(uint256 loanId, string calldata reason)
        external
        whenNotPaused
        onlyRole(AUDITOR_ROLE)
    {
        LoanCase storage lc = loanCases[loanId];
        require(lc.borrower != address(0), "loan not found");
        require(lc.status == LoanStatus.Pending, "not pending");

        lc.status = LoanStatus.Rejected;
        emit LoanRejected(loanId, lc.borrower, lc.principal, reason);
    }

    function approveRedeem(uint256 redeemId) external whenNotPaused onlyRole(AUDITOR_ROLE) {
        RedeemCase storage rc = redeemCases[redeemId];
        require(rc.user != address(0), "redeem not found");
        require(rc.status == RedeemStatus.Pending, "not pending");
        require(!rc.approvedBy[msg.sender], "already approved");

        rc.approvedBy[msg.sender] = true;
        rc.approvals += 1;

        if (rc.approvals >= 2) {
            rc.status = RedeemStatus.Approved;
            require(address(this).balance >= rc.ethAmount, "insufficient ETH reserve");
            (bool ok, ) = rc.user.call{value: rc.ethAmount}("");
            require(ok, "ETH transfer failed");
            totalDepositsSusd -= rc.susdAmount;
            emit RedeemApproved(redeemId, rc.user, rc.susdAmount, rc.ethAmount);
        }
    }

    function rejectRedeem(uint256 redeemId, string calldata reason)
        external
        whenNotPaused
        onlyRole(AUDITOR_ROLE)
    {
        RedeemCase storage rc = redeemCases[redeemId];
        require(rc.user != address(0), "redeem not found");
        require(rc.status == RedeemStatus.Pending, "not pending");

        rc.status = RedeemStatus.Rejected;
        balances[rc.user] += rc.susdAmount;
        emit RedeemRejected(redeemId, rc.user, rc.susdAmount, reason);
    }

    function setFrequencyParams(uint256 windowSec, uint256 maxCount, uint256 lockSec)
        external
        onlyAdmin
    {
        frequencyWindow = windowSec;
        maxTxPerWindow = maxCount;
        lockDuration = lockSec;
        logContract.emitGlobalParamUpdated(
            "FREQUENCY",
            bytes32(0),
            keccak256(abi.encode(windowSec, maxCount, lockSec))
        );
    }

    function pause() external onlyAdmin {
        paused = true;
    }

    function unpause() external onlyAdmin {
        paused = false;
    }

    function setDepositApyBps(uint256 bps) external onlyAdmin {
        depositApyBps = bps;
    }

    /// @notice 用户申请将银行内部 sUSD 余额赎回为外部原生 ETH。
    /// @dev 前端按实时 USDT/ETH 汇率换算 ethAmount 后传入，合约仅做校验和转账。
    function redeemToAsset(string calldata assetSymbol, uint256 susdAmount, uint256 ethAmount)
        external
        whenNotPaused
        onlyCompliantUser
    {
        require(susdAmount > 0, "susd=0");
        require(ethAmount > 0, "eth=0");
        require(balances[msg.sender] >= susdAmount, "insufficient");

        balances[msg.sender] -= susdAmount;

        uint256 redeemId = nextRedeemId++;
        RedeemCase storage rc = redeemCases[redeemId];
        rc.user = msg.sender;
        rc.assetSymbol = assetSymbol;
        rc.susdAmount = susdAmount;
        rc.ethAmount = ethAmount;
        rc.status = RedeemStatus.Pending;
        rc.createdAt = block.timestamp;

        emit RedeemRequested(redeemId, msg.sender, assetSymbol, susdAmount);
    }
}


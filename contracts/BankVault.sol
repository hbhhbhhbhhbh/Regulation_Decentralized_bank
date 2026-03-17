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

    bool public paused;

    /// @dev 存款年化利率 (bps)，对外展示用；管理员可调
    uint256 public depositApyBps = 200;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event ImmediateTransfer(address indexed from, address indexed to, uint256 amount);
    event EscrowCreated(uint256 indexed caseId, address indexed from, address indexed to, uint256 amount);
    event EscrowApproved(uint256 indexed caseId, address indexed from, address indexed to, uint256 amount);
    event EscrowRejected(uint256 indexed caseId, address indexed from, address indexed to, uint256 amount, string reason);
    event LoanRequested(address indexed borrower, uint256 principal, uint256 rateBps);
    event LoanRepaid(address indexed borrower, uint256 amount);

    /// @dev 用户申请将银行 sUSD 余额赎回为某种外部资产（实际兑付由银行后台处理）
    event RedeemRequested(
        uint256 indexed redeemId,
        address indexed user,
        string assetSymbol,
        uint256 susdAmount
    );

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

    /// @notice 仅根据外部资产价值，直接为用户记入 sUSD 账本余额。
    /// @dev 不从用户钱包收取任何 ERC20 代币，适用于外部 BTC/ETH 等通过链下渠道入金的场景。
    function depositFromExternal(uint256 susdAmount) external whenNotPaused onlyCompliantUser {
        require(susdAmount > 0, "susd=0");
        balances[msg.sender] += susdAmount;
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
        uint256 rateBps = riskEngine.getInterestRateBps(msg.sender);
        emit LoanRequested(msg.sender, principal, rateBps);
    }

    function repayLoan(uint256 amount) external whenNotPaused onlyCompliantUser {
        require(amount > 0, "amount=0");
        require(token.transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        emit LoanRepaid(msg.sender, amount);
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

    /// @notice 用户申请将银行内部 sUSD 余额赎回为某种外部资产（BTC/ETH/USDT 等）。
    /// @dev 合约仅扣减账本并发出事件，实际兑付由银行后台/运营系统依据该事件处理。
    function redeemToAsset(string calldata assetSymbol, uint256 susdAmount)
        external
        whenNotPaused
        onlyCompliantUser
    {
        require(susdAmount > 0, "susd=0");
        require(balances[msg.sender] >= susdAmount, "insufficient");

        balances[msg.sender] -= susdAmount;

        uint256 redeemId = nextRedeemId++;
        emit RedeemRequested(redeemId, msg.sender, assetSymbol, susdAmount);
    }
}


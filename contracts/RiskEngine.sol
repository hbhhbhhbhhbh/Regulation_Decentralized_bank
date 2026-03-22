// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title RiskEngine
 * @dev 管理用户 riskScore、dailyLimit、利率；结合 KYC/CDD 数据。
 */
contract RiskEngine is AccessControl {
    bytes32 public constant RISK_OFFICER_ROLE = keccak256("RISK_OFFICER_ROLE");

    struct RiskProfile {
        uint8 riskScore;
        uint256 dailyTransferLimit;
        uint256 lastUpdatedAt;
    }

    mapping(address => RiskProfile) public riskProfiles;

    uint256 public baseInterestBps = 300;
    uint256 public riskSlopeBps = 20;
    uint256 public optimalUtilization = 0.8 * 1e18; // 最佳利用率 80%
    uint256 public slope1Bps = 400;                 // 最佳利用率时的最大附加利率 (4%)
    uint256 public slope2Bps = 3000;                // 超过最佳利用率后的惩罚斜率基准 (30%)
    uint256 public reserveFactorBps = 2000;

    event RiskInitialized(address indexed user, uint8 score, uint256 dailyLimit);
    event RiskUpdated(address indexed user, uint8 score, uint256 dailyLimit);
    event BaseInterestUpdated(uint256 newBaseBps);
    event RiskSlopeUpdated(uint256 newSlopeBps);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function initRisk(
        address user,
        uint8 score,
        uint256 dailyLimit
    ) external onlyRole(RISK_OFFICER_ROLE) {
        require(score > 0 && score <= 100, "invalid score");
        require(riskProfiles[user].riskScore == 0, "already initialized");

        riskProfiles[user] = RiskProfile({
            riskScore: score,
            dailyTransferLimit: dailyLimit,
            lastUpdatedAt: block.timestamp
        });

        emit RiskInitialized(user, score, dailyLimit);
    }

    function calculateUtilizationRateBps(uint256 totalBorrowed, uint256 totalLiquidity) public view returns (uint256) {
        if (totalLiquidity == 0) return 0;

        // 计算利用率 U，乘以 1e18 保持精度
        uint256 utilization = (totalBorrowed * 1e18) / totalLiquidity;

        if (utilization <= optimalUtilization) {
            // 第一段：缓慢上升
            // rate = slope1 * (U / Optimal_U)
            return (slope1Bps * utilization) / optimalUtilization;
        } else {
            // 第二段：急剧上升
            // rate = slope1 + slope2 * ((U - Optimal_U) / (1 - Optimal_U))
            uint256 excessUtilization = utilization - optimalUtilization;
            uint256 remainingUtilization = 1e18 - optimalUtilization;
            return slope1Bps + ((slope2Bps * excessUtilization) / remainingUtilization);
        }
    }
    function updateRisk(
        address user,
        uint8 newScore,
        uint256 newDailyLimit
    ) external onlyRole(RISK_OFFICER_ROLE) {
        require(newScore > 0 && newScore <= 100, "invalid score");
        RiskProfile storage p = riskProfiles[user];
        require(p.riskScore != 0, "not initialized");

        p.riskScore = newScore;
        p.dailyTransferLimit = newDailyLimit;
        p.lastUpdatedAt = block.timestamp;

        emit RiskUpdated(user, newScore, newDailyLimit);
    }

    function getRiskScore(address user) external view returns (uint8) {
        return riskProfiles[user].riskScore;
    }

    function getDailyLimit(address user) external view returns (uint256) {
        return riskProfiles[user].dailyTransferLimit;
    }

    function getInterestRateBps(
        address user,
        uint256 totalBorrowed,
        uint256 totalLiquidity
    ) external view returns (uint256) {
        RiskProfile memory p = riskProfiles[user];
        
        // 1. 获取基础系统利用率利率
        uint256 utilizationBps = calculateUtilizationRateBps(totalBorrowed, totalLiquidity);
        
        // 2. 如果用户未初始化，只返回 基础利率 + 利用率利率
        if (p.riskScore == 0) {
            return baseInterestBps + utilizationBps;
        }

        // 3. 计算用户个人的风险溢价 (保留你原有的优秀逻辑)
        uint256 riskComponent = (riskSlopeBps * p.riskScore) / 100;
        
        // 最终利率 = 基础利率 + 系统利用率附加 + 个人风险附加
        return baseInterestBps + utilizationBps + riskComponent;
    }

    function getDepositRateBps(uint256 totalBorrowed, uint256 totalDeposits) external view returns (uint256) {
        // 如果没有存款，或者没有借出，存款收益自然是 0
        if (totalDeposits == 0 || totalBorrowed == 0) {
            return 0;
        }

        // 1. 计算资金利用率 U (单位: Bps, 10000 = 100%)
        uint256 utilizationBps = (totalBorrowed * 10000) / totalDeposits;
        if (utilizationBps > 10000) {
            utilizationBps = 10000; // 保护机制：利用率最高 100%
        }

        // --- 核心修复区 ---
        // 获取你顶部定义的 baseInterestBps
        uint256 globalBorrowRateBps = baseInterestBps; 
        
        // 将你顶部 1e18 精度的 optimalUtilization 临时转换为 Bps 精度 (即 8000)
        uint256 optimalUtilBps = (optimalUtilization * 10000) / 1e18;
        // -----------------

        // 2. 获取当前的全局基础借款利率
        if (utilizationBps <= optimalUtilBps) {
            globalBorrowRateBps += (slope1Bps * utilizationBps) / optimalUtilBps;
        } else {
            globalBorrowRateBps += slope1Bps;
            uint256 excessUtil = utilizationBps - optimalUtilBps;
            uint256 remainingUtil = 10000 - optimalUtilBps;
            globalBorrowRateBps += (slope2Bps * excessUtil) / remainingUtil;
        }

        // 3. 计算存款收益率 depositAPY
        uint256 portionForDepositors = 10000 - reserveFactorBps;
        uint256 depositRateBps = (globalBorrowRateBps * utilizationBps * portionForDepositors) / 100000000;

        return depositRateBps;
    }

    function setBaseInterestBps(uint256 newBaseBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        baseInterestBps = newBaseBps;
        emit BaseInterestUpdated(newBaseBps);
    }

    function setRiskSlopeBps(uint256 newSlopeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        riskSlopeBps = newSlopeBps;
        emit RiskSlopeUpdated(newSlopeBps);
    }
}


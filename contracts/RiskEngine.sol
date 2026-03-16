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

    function getInterestRateBps(address user) external view returns (uint256) {
        RiskProfile memory p = riskProfiles[user];
        if (p.riskScore == 0) return baseInterestBps;
        uint256 riskComponent = (riskSlopeBps * p.riskScore) / 100;
        return baseInterestBps + riskComponent;
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


// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ComplianceLog
 * @dev 仅负责发出各类监管事件，形成审计足迹。
 */
contract ComplianceLog {
    event AMLAlert(address indexed user, string alertType, string details);
    event EDDRequested(address indexed user, uint256 caseId, string reason);

    event TransferRequested(
        uint256 indexed caseId,
        address indexed from,
        address indexed to,
        uint256 amount
    );
    event TransferEscrowed(
        uint256 indexed caseId,
        address indexed from,
        address indexed to,
        uint256 amount,
        string reason
    );
    event TransferApproved(uint256 indexed caseId, address indexed auditor);
    event TransferRejected(uint256 indexed caseId, address indexed auditor, string reason);

    event AccountLocked(address indexed user, uint256 until, string reason);
    event AccountUnlocked(address indexed user);

    event AuditorAdded(address indexed auditor);
    event AuditorRemoved(address indexed auditor);
    event GlobalParamUpdated(string paramName, bytes32 oldValue, bytes32 newValue);
    event BlacklistUpdated(address indexed who, bool isBlacklisted);

    function emitAMLAlert(address user, string calldata alertType, string calldata details) external {
        emit AMLAlert(user, alertType, details);
    }

    function emitEDDRequested(address user, uint256 caseId, string calldata reason) external {
        emit EDDRequested(user, caseId, reason);
    }

    function emitTransferRequested(
        uint256 caseId,
        address from,
        address to,
        uint256 amount
    ) external {
        emit TransferRequested(caseId, from, to, amount);
    }

    function emitTransferEscrowed(
        uint256 caseId,
        address from,
        address to,
        uint256 amount,
        string calldata reason
    ) external {
        emit TransferEscrowed(caseId, from, to, amount, reason);
    }

    function emitTransferApproved(uint256 caseId, address auditor) external {
        emit TransferApproved(caseId, auditor);
    }

    function emitTransferRejected(uint256 caseId, address auditor, string calldata reason) external {
        emit TransferRejected(caseId, auditor, reason);
    }

    function emitAccountLocked(address user, uint256 until, string calldata reason) external {
        emit AccountLocked(user, until, reason);
    }

    function emitAccountUnlocked(address user) external {
        emit AccountUnlocked(user);
    }

    function emitAuditorAdded(address auditor) external {
        emit AuditorAdded(auditor);
    }

    function emitAuditorRemoved(address auditor) external {
        emit AuditorRemoved(auditor);
    }

    function emitGlobalParamUpdated(
        string calldata paramName,
        bytes32 oldValue,
        bytes32 newValue
    ) external {
        emit GlobalParamUpdated(paramName, oldValue, newValue);
    }

    function emitBlacklistUpdated(address who, bool isBlacklisted) external {
        emit BlacklistUpdated(who, isBlacklisted);
    }
}


// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title IdentityRegistry
 * @dev KYC 信息存储 + 不可转让 SBT。所有受监管操作通过 hasValidSBT 进行准入检查。
 */
contract IdentityRegistry is ERC721, AccessControl {
    bytes32 public constant KYC_OFFICER_ROLE = keccak256("KYC_OFFICER_ROLE");

    struct KYCRecord {
        bool isKYCCompleted;
        uint8 riskProfile;
        string countryCode;
        uint256 createdAt;
        uint256 updatedAt;
    }

    mapping(address => KYCRecord) public kycRecords;
    mapping(address => uint256) public sbtIdOf;
    uint256 public nextTokenId = 1;

    event KYCRegistered(address indexed user, uint8 riskProfile, string countryCode);
    event KYCUpdated(address indexed user, uint8 riskProfile, string countryCode);
    event SBTIssued(address indexed user, uint256 tokenId);

    constructor() ERC721("SafeHarborKYC", "SHIB-KYC") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function registerKYC(
        address user,
        uint8 riskProfile,
        string calldata countryCode
    ) external onlyRole(KYC_OFFICER_ROLE) {
        require(user != address(0), "invalid user");
        require(!kycRecords[user].isKYCCompleted, "already KYCed");

        kycRecords[user] = KYCRecord({
            isKYCCompleted: true,
            riskProfile: riskProfile,
            countryCode: countryCode,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        uint256 tokenId = nextTokenId++;
        _safeMint(user, tokenId);
        sbtIdOf[user] = tokenId;

        emit KYCRegistered(user, riskProfile, countryCode);
        emit SBTIssued(user, tokenId);
    }

    function updateKYC(
        address user,
        uint8 riskProfile,
        string calldata countryCode
    ) external onlyRole(KYC_OFFICER_ROLE) {
        require(kycRecords[user].isKYCCompleted, "not KYCed");

        kycRecords[user].riskProfile = riskProfile;
        kycRecords[user].countryCode = countryCode;
        kycRecords[user].updatedAt = block.timestamp;

        emit KYCUpdated(user, riskProfile, countryCode);
    }

    function hasValidSBT(address user) public view returns (bool) {
        if (!kycRecords[user].isKYCCompleted) return false;
        if (balanceOf(user) == 0) return false;
        return true;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal virtual override {
        if (from != address(0) && to != address(0) && from != to) {
            revert("SBT is non-transferable");
        }
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(AccessControl, ERC721)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}


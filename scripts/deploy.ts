import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const FRONTEND_CONTRACTS = path.join(__dirname, "..", "frontend", "src", "contracts");

async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const testUser = signers[1];
  const auditor1 = signers[2];
  const auditor2 = signers[3];

  console.log("Deploying contracts with:", deployer.address);

  const Token = await ethers.getContractFactory("MockStablecoin");
  const token = await Token.deploy();
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("Token deployed to:", tokenAddr);

  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const identity = await IdentityRegistry.deploy();
  await identity.waitForDeployment();
  const identityAddr = await identity.getAddress();
  console.log("IdentityRegistry deployed to:", identityAddr);

  const RiskEngine = await ethers.getContractFactory("RiskEngine");
  const riskEngine = await RiskEngine.deploy();
  await riskEngine.waitForDeployment();
  const riskEngineAddr = await riskEngine.getAddress();
  console.log("RiskEngine deployed to:", riskEngineAddr);

  const ComplianceLog = await ethers.getContractFactory("ComplianceLog");
  const complianceLog = await ComplianceLog.deploy();
  await complianceLog.waitForDeployment();
  const complianceLogAddr = await complianceLog.getAddress();
  console.log("ComplianceLog deployed to:", complianceLogAddr);

  const BankVault = await ethers.getContractFactory("BankVault");
  const bankVault = await BankVault.deploy(
    tokenAddr,
    identityAddr,
    riskEngineAddr,
    complianceLogAddr
  );
  await bankVault.waitForDeployment();
  const bankVaultAddr = await bankVault.getAddress();
  console.log("BankVault deployed to:", bankVaultAddr);

  // Grant deployer KYC_OFFICER and RISK_OFFICER so one address can onboard users
  const KYC_OFFICER = await identity.KYC_OFFICER_ROLE();
  const RISK_OFFICER = await riskEngine.RISK_OFFICER_ROLE();
  await identity.grantRole(KYC_OFFICER, deployer.address);
  await riskEngine.grantRole(RISK_OFFICER, deployer.address);
  console.log("Granted KYC_OFFICER and RISK_OFFICER to deployer.");

  // Auto-setup: one KYC'ed user + two auditors for local testing
  const dailyLimit = ethers.parseEther("50000");
  await identity.registerKYC(testUser.address, 40, "HK");
  await riskEngine.initRisk(testUser.address, 40, dailyLimit);
  await bankVault.addAuditor(auditor1.address);
  await bankVault.addAuditor(auditor2.address);
  console.log("Initialized test user and two auditors for local testing.");

  // Write addresses for frontend
  if (!fs.existsSync(FRONTEND_CONTRACTS)) {
    fs.mkdirSync(FRONTEND_CONTRACTS, { recursive: true });
  }
  const abiDir = path.join(FRONTEND_CONTRACTS, "abis");
  if (!fs.existsSync(abiDir)) fs.mkdirSync(abiDir, { recursive: true });

  const addresses: Record<string, string> = {
    token: tokenAddr,
    identity: identityAddr,
    riskEngine: riskEngineAddr,
    complianceLog: complianceLogAddr,
    bankVault: bankVaultAddr,
  };
  fs.writeFileSync(
    path.join(FRONTEND_CONTRACTS, "addresses.json"),
    JSON.stringify(addresses, null, 2)
  );

  const artifactNames = ["MockStablecoin", "IdentityRegistry", "RiskEngine", "ComplianceLog", "BankVault"];
  const artifactPaths: Record<string, string> = {
    MockStablecoin: "contracts/MockStablecoin.sol",
    IdentityRegistry: "contracts/IdentityRegistry.sol",
    RiskEngine: "contracts/RiskEngine.sol",
    ComplianceLog: "contracts/ComplianceLog.sol",
    BankVault: "contracts/BankVault.sol",
  };
  for (const name of artifactNames) {
    const artPath = path.join(__dirname, "..", "artifacts", artifactPaths[name], `${name}.json`);
    if (fs.existsSync(artPath)) {
      const art = JSON.parse(fs.readFileSync(artPath, "utf-8"));
      fs.writeFileSync(path.join(abiDir, `${name}.json`), JSON.stringify(art.abi, null, 2));
    }
  }
  console.log("Wrote frontend/src/contracts/addresses.json and abis.");

  // 角色说明：部署后哪些地址是哪些角色
  console.log("\n========== 角色与地址 (Roles & Addresses) ==========");
  console.log("【管理员 Admin】");
  console.log("  Account #0:", deployer.address, " ← 部署账户");
  console.log("\n【默认用户 User】");
  console.log("  Account #1:", testUser.address, " ← 已自动完成 KYC 与风险初始化");
  console.log("\n【默认审计员 Auditors】");
  console.log("  Account #2:", auditor1.address, " ← 自动授权为审计员 1");
  console.log("  Account #3:", auditor2.address, " ← 自动授权为审计员 2");
  console.log("\n【空白测试账户】");
  console.log("  Account #4 及以后: 纯白纸状态，可用于从零测试 Admin 手动开户流程");
  console.log("==================================================\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


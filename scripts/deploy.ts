import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with:", deployer.address);

  const Token = await ethers.getContractFactory("MockStablecoin");
  const token = await Token.deploy();
  await token.waitForDeployment();
  console.log("Token deployed to:", await token.getAddress());

  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const identity = await IdentityRegistry.deploy();
  await identity.waitForDeployment();
  console.log("IdentityRegistry deployed to:", await identity.getAddress());

  const RiskEngine = await ethers.getContractFactory("RiskEngine");
  const riskEngine = await RiskEngine.deploy();
  await riskEngine.waitForDeployment();
  console.log("RiskEngine deployed to:", await riskEngine.getAddress());

  const ComplianceLog = await ethers.getContractFactory("ComplianceLog");
  const complianceLog = await ComplianceLog.deploy();
  await complianceLog.waitForDeployment();
  console.log("ComplianceLog deployed to:", await complianceLog.getAddress());

  const BankVault = await ethers.getContractFactory("BankVault");
  const bankVault = await BankVault.deploy(
    await token.getAddress(),
    await identity.getAddress(),
    await riskEngine.getAddress(),
    await complianceLog.getAddress()
  );
  await bankVault.waitForDeployment();
  console.log("BankVault deployed to:", await bankVault.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


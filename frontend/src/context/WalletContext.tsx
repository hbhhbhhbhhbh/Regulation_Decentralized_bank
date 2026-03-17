import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { BrowserProvider, Contract, JsonRpcSigner } from "ethers";
import addresses from "../contracts/addresses.json";
import tokenAbi from "../contracts/abis/MockStablecoin.json";
import identityAbi from "../contracts/abis/IdentityRegistry.json";
import riskEngineAbi from "../contracts/abis/RiskEngine.json";
import bankVaultAbi from "../contracts/abis/BankVault.json";

export type Role = "admin" | "auditor" | "user" | "none";

interface ContractSet {
  token: Contract | null;
  identity: Contract | null;
  riskEngine: Contract | null;
  bankVault: Contract | null;
}

interface WalletContextValue {
  address: string | null;
  role: Role;
  contracts: ContractSet;
  signer: JsonRpcSigner | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshRole: () => Promise<void>;
  isReady: boolean;
  chainId: number | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const LOCALHOST_CHAIN_ID = 31337;

declare global {
  interface Window {
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  }
}

const tokenAbiArr = Array.isArray(tokenAbi) ? tokenAbi : [];
const identityAbiArr = Array.isArray(identityAbi) ? identityAbi : [];
const riskEngineAbiArr = Array.isArray(riskEngineAbi) ? riskEngineAbi : [];
const bankVaultAbiArr = Array.isArray(bankVaultAbi) ? bankVaultAbi : [];

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("none");
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [contracts, setContracts] = useState<ContractSet>({
    token: null,
    identity: null,
    riskEngine: null,
    bankVault: null,
  });
  const [chainId, setChainId] = useState<number | null>(null);

  const hasAddresses =
    addresses.token &&
    addresses.identity &&
    addresses.riskEngine &&
    addresses.bankVault;

  const refreshRole = useCallback(async () => {
    if (!address || !hasAddresses || !contracts.bankVault || !contracts.identity) {
      setRole("none");
      return;
    }
    try {
      const vault = contracts.bankVault;
      const identity = contracts.identity;
      const adminRole = await vault.ADMIN_ROLE();
      const auditorRole = await vault.AUDITOR_ROLE();
      const defaultAdmin = "0x0000000000000000000000000000000000000000000000000000000000000000";

      const isAdmin =
        await vault.hasRole(adminRole, address) || await vault.hasRole(defaultAdmin, address);
      const isAuditor = await vault.hasRole(auditorRole, address);

      if (isAdmin) {
        setRole("admin");
        return;
      }
      if (isAuditor) {
        setRole("auditor");
        return;
      }
      const hasSBT = await identity.hasValidSBT(address);
      setRole(hasSBT ? "user" : "none");
    } catch (e) {
      console.error("refreshRole", e);
      setRole("none");
    }
  }, [address, hasAddresses, contracts.bankVault, contracts.identity]);

  const connect = useCallback(async () => {
    const eth = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!eth) {
      alert("请安装 MetaMask 或其它注入钱包");
      return;
    }
    const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
    if (!accounts.length) return;
    const provider = new BrowserProvider(eth);
    const net = await provider.getNetwork();
    setChainId(Number(net.chainId));
    if (Number(net.chainId) !== LOCALHOST_CHAIN_ID) {
      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x7a69" }],
        });
      } catch {
        alert("请切换到本地网络 (Chain ID 31337)。先运行 npx hardhat node。");
      }
    }
    const signerInstance = await provider.getSigner();
    setAddress(accounts[0]);
    setSigner(signerInstance);

    if (!hasAddresses) {
      setContracts({ token: null, identity: null, riskEngine: null, bankVault: null });
      setRole("none");
      return;
    }

    const token =
      tokenAbiArr.length && addresses.token
        ? new Contract(addresses.token, tokenAbiArr, signerInstance)
        : null;
    const identity =
      identityAbiArr.length && addresses.identity
        ? new Contract(addresses.identity, identityAbiArr, signerInstance)
        : null;
    const riskEngine =
      riskEngineAbiArr.length && addresses.riskEngine
        ? new Contract(addresses.riskEngine, riskEngineAbiArr, signerInstance)
        : null;
    const bankVault =
      bankVaultAbiArr.length && addresses.bankVault
        ? new Contract(addresses.bankVault, bankVaultAbiArr, signerInstance)
        : null;

    setContracts({ token, identity, riskEngine, bankVault });
    setRole("none");
  }, [hasAddresses]);

  useEffect(() => {
    if (address && contracts.bankVault && contracts.identity) refreshRole();
  }, [address, contracts.bankVault, contracts.identity, refreshRole]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setSigner(null);
    setRole("none");
    setContracts({ token: null, identity: null, riskEngine: null, bankVault: null });
  }, []);

  const isReady = !!address && (role !== "none" || !hasAddresses);

  return (
    <WalletContext.Provider
      value={{
        address,
        role,
        contracts,
        signer,
        connect,
        disconnect,
        refreshRole,
        isReady,
        chainId,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

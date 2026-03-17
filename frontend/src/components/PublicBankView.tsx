import React, { useCallback, useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { useRates } from "../context/RatesContext";

/** 公开银行信息与 KYC 流程，任何人可见；涉及具体用户的操作需以「用户」身份登录 */

export const PublicBankView: React.FC = () => {
  const { address, contracts, role } = useWallet();
  const { assetPricesUSD } = useRates();
  const [depositApyBps, setDepositApyBps] = useState<number>(200);
  const [lendBaseBps, setLendBaseBps] = useState<number>(300);
  const [lendSlopeBps, setLendSlopeBps] = useState<number>(20);
  const [copied, setCopied] = useState(false);

  const loadRates = useCallback(async () => {
    if (contracts.bankVault) {
      try {
        const apy = await contracts.bankVault.depositApyBps();
        setDepositApyBps(Number(apy));
      } catch (_) {}
    }
    if (contracts.riskEngine) {
      try {
        const [base, slope] = await Promise.all([
          contracts.riskEngine.baseInterestBps(),
          contracts.riskEngine.riskSlopeBps(),
        ]);
        setLendBaseBps(Number(base));
        setLendSlopeBps(Number(slope));
      } catch (_) {}
    }
  }, [contracts.bankVault, contracts.riskEngine]);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  const copyAddress = useCallback(() => {
    if (!address) return;
    void navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [address]);

  const depositApyPercent = (depositApyBps / 100).toFixed(2);
  const lendMinPercent = (lendBaseBps / 100).toFixed(2);
  const lendMaxPercent = ((lendBaseBps + lendSlopeBps) / 100).toFixed(2);

  const btcRow = assetPricesUSD.find((r) => r.symbol === "BTC");
  const ethRow = assetPricesUSD.find((r) => r.symbol === "ETH");

  return (
    <div className="public-view">
      <div className="panel panel-hero">
        <section className="panel-section">
          <h2>SafeHarbor 银行 · 产品说明</h2>
          <p className="lead">本行发行自有稳定币 <strong>sUSD</strong>，支持多资产存入与合规借贷。</p>
        </section>

        <section className="panel-section">
          <h3>本行代币</h3>
          <p><strong>sUSD (SafeHarbor USD)</strong>：本行发行的链上稳定币，用于存款计息、转账与借贷。所有业务均以 sUSD 计价与结算。上方每日牌价可查看 sUSD 兑各外币汇率及主要资产美元价格。</p>
        </section>

        <section className="panel-section">
          <h3>支持存入的资产</h3>
          <p>您可将以下资产存入本行，按当日牌价兑换为 sUSD 后享受存款利率与完整服务：</p>
          <ul className="asset-list">
            <li><strong>BTC</strong>：1 BTC → 约 {btcRow ? (btcRow.priceUSD / 1).toLocaleString() : "97,000"} sUSD <span className="hint">（参考上方美元价格）</span></li>
            <li><strong>ETH</strong>：1 ETH → 约 {ethRow ? ethRow.priceUSD.toLocaleString() : "3,500"} sUSD <span className="hint">（参考上方美元价格）</span></li>
            <li><strong>USDT</strong>：1 USDT → 1 sUSD <span className="hint">（锚定 1:1）</span></li>
          </ul>
          <p className="hint">当前演示环境仅支持 sUSD 直接操作；多资产入金在正式环境中由托管与报价模块完成。</p>
        </section>

        <section className="panel-section">
          <h3>存款利率</h3>
          <p>以 sUSD 存入本行金库，享受年化收益：</p>
          <p className="rate-display"><strong>存款年化 APY：{depositApyPercent}%</strong></p>
        </section>

        <section className="panel-section">
          <h3>借贷服务</h3>
          <p>本行提供 sUSD 借贷。借出额度与年化利率<strong>依用户风险等级不同</strong>：</p>
          <ul>
          <li>借贷年化 APR 区间：约 <strong>{lendMinPercent}% ～ {lendMaxPercent}%</strong>（低风险用户利率更低）</li>
          <li>单用户日转出限额、可借额度由完成 KYC 后的风险评分与 CDD 结果决定。</li>
        </ul>
        <p className="hint">具体您的额度与利率需完成 KYC 并登录「用户」账户后查看。</p>
        </section>

        <section className="panel-section kyc-section">
          <h3>如何成为本行用户（KYC 申请流程）</h3>
          <p>只有完成 KYC 的地址才能以<strong>用户</strong>身份登录，进行存款、取款、转账与借贷。流程如下：</p>
          <ol className="kyc-steps">
          <li><strong>准备您的钱包地址</strong>：使用支持本链的钱包（如 MetaMask），连接后可在下方复制您的地址。</li>
          <li><strong>向本行提交申请</strong>：将您的<strong>钱包地址</strong>及合规所需身份信息（按当地法规）提交至本行（例如：柜台、邮件或指定 KYC 入口）。</li>
          <li><strong>链上登记</strong>：本行审核通过后，管理员会在链上为该地址执行：① 身份注册（KYC）；② 风险与日限额初始化。您无需自行调用合约。</li>
          <li><strong>登录使用</strong>：完成上述步骤后，使用<strong>同一地址</strong>连接本页面并连接钱包，系统将识别您为「用户」，您即可看到个人资产、限额并进行存款、取款、转账与借贷操作。</li>
        </ol>
        {address ? (
          <div className="kyc-address-box">
            <p>您的钱包地址（用于向银行提交 KYC 申请）：</p>
            <div className="address-row">
              <code className="addr-code" title={address}>{address}</code>
              <button type="button" className="btn-copy" onClick={copyAddress}>
                {copied ? "已复制" : "复制地址"}
              </button>
            </div>
            {role === "none" && (
              <p className="hint">该地址尚未完成链上 KYC。请将上述地址提供给银行，完成审核与链上登记后再连接即可登录为「用户」。</p>
            )}
          </div>
        ) : (
          <p className="hint">连接钱包后，此处将显示您的地址，便于您复制并提交给银行用于 KYC 申请。</p>
        )}
        </section>

        <section className="panel-section">
          <h3>登录与权限说明</h3>
          <p>· <strong>任何人</strong>均可查看本页：代币说明、利率、借贷说明及 KYC 流程。</p>
          <p>· <strong>涉及您本人的资产与操作</strong>（余额、存款、取款、转账、借贷、个人限额与利率）需以<strong>用户</strong>身份登录后方可查看与执行，请先完成上述 KYC 流程。</p>
        </section>
      </div>
    </div>
  );
};

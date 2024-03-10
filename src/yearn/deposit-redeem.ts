import YEARN_VAULT_ABI from "../abis/yearn/YearnVault.json";
import ERC20ABI from "../abis/common/ERC20.json";
import { BigNumber, ContractInterface, ethers } from "ethers";
import { INFRA, NETWORKS } from "../constants";
import routerAbi from "../abis/infra/Router.json";
import { loadPrettyConsole } from "../utils/prettyConsole";

const pc = loadPrettyConsole();

export async function depositToYearn(
  tokenAddr: string,
  pool: string,
  amount: BigNumber,
  receiver: string,
  chainId: string
) {
  try {
    const provider = new ethers.providers.JsonRpcProvider(NETWORKS[chainId]);
    const token = new ethers.Contract(tokenAddr, ERC20ABI, provider);
    const vault = new ethers.Contract(pool, YEARN_VAULT_ABI, provider);
    const tokenBalance = await token.balanceOf(receiver);
    const infraRouter = String(INFRA[chainId].ROUTER);

    const InfraRouterContract = new ethers.Contract(
      infraRouter,
      routerAbi,
      provider
    );

    const agentAddress = await InfraRouterContract?.getAgentAddress(receiver);

    if (tokenBalance.lt(amount)) {
      throw new Error("::API:: Insufficient balance");
    }

    let Approvals = [];
    let Calldatas = [];
    let TokensReturn = [];

    const allowanceAgent = await token?.allowance(receiver, agentAddress);

    // Sender Approval
    if (allowanceAgent.lt(amount)) {
      const approveData = token.interface.encodeFunctionData("approve", [
        agentAddress,
        ethers.BigNumber.from(2).pow(256).sub(1),
      ]);

      const approvalCalldata = {
        to: token.address,
        data: approveData,
        value: 0,
      };

      Approvals.push(approvalCalldata);
    } else {
      pc.log("::API:: No need to approve Agent Address");
    }

    const allowanceYearn = await token?.allowance(agentAddress, pool);

    // Agents Calldatas
    if (allowanceYearn.lt(amount)) {
      const approveData = token.interface.encodeFunctionData("approve", [
        pool,
        ethers.BigNumber.from(2).pow(256).sub(1),
      ]);

      const approvalCalldata = {
        to: token.address,
        data: approveData,
        value: 0,
      };

      Calldatas.push(approvalCalldata);
    } else {
      pc.log("::API:: No need to approve Yearn Vault");
    }

    const transferFromData = token.interface.encodeFunctionData(
      "transferFrom",
      [receiver, agentAddress, amount]
    );

    const transferFromCalldata = {
      to: token.address,
      data: transferFromData,
      value: 0,
    };

    Calldatas.push(transferFromCalldata);

    const depositData = vault.interface.encodeFunctionData(
      "deposit(uint256,address)",
      [amount, receiver]
    );

    const depositCalldata = {
      to: pool,
      data: depositData,
      value: 0,
    };

    Calldatas.push(depositCalldata);
    TokensReturn.push(vault.address);

    console.log("::API Deposit:: Approvals", Approvals);
    console.log("::API Deposit:: Calldatas", Calldatas);
    console.log("::API Deposit:: TokensReturn", TokensReturn);

    return {
      Approvals,
      Calldatas,
      TokensReturn,
    };
  } catch (e) {
    pc.log(e);
  }
}

export async function redeemFromYearn(
  pool: string,
  amount: BigNumber,
  receiver: string,
  chainId: number
) {
  try {
    const provider = new ethers.providers.JsonRpcProvider(NETWORKS[chainId]);
    const vault = new ethers.Contract(
      pool,
      YEARN_VAULT_ABI as ContractInterface,
      provider
    );
    const vaultBalance = await vault.balanceOf(receiver);

    if (vaultBalance.lt(amount)) {
      throw new Error("::API:: Insufficient balance");
    }

    const infraRouter = String(INFRA[chainId].ROUTER);

    const InfraRouterContract = new ethers.Contract(
      infraRouter,
      routerAbi,
      provider
    );

    const agentAddress = await InfraRouterContract?.getAgentAddress(receiver);

    let Approvals = [];
    let Calldatas = [];
    let TokensReturn = [];

    const allowanceAgent = await vault?.allowance(receiver, agentAddress);

    if (allowanceAgent.lt(amount)) {
      const approveData = vault.interface.encodeFunctionData("approve", [
        agentAddress,
        ethers.BigNumber.from(2).pow(256).sub(1),
      ]);

      const approvalCalldata = {
        to: vault.address,
        data: approveData,
        value: 0,
      };

      Approvals.push(approvalCalldata);
    } else {
      pc.log("::API:: No need to approve agent address");
    }

    const allowanceAgentYearn = await vault?.allowance(agentAddress, pool);

    if (allowanceAgentYearn.lt(amount)) {
      const approveData = vault.interface.encodeFunctionData("approve", [
        pool,
        ethers.BigNumber.from(2).pow(256).sub(1),
      ]);

      const approvalCalldata = {
        to: vault.address,
        data: approveData,
        value: 0,
      };

      Calldatas.push(approvalCalldata);
    } else {
      pc.log("::API:: No need to approve Yearn Vault");
    }

    const transferFromData = vault.interface.encodeFunctionData(
      "transferFrom",
      [receiver, agentAddress, amount]
    );

    const transferFromCalldata = {
      to: vault.address,
      data: transferFromData,
      value: 0,
    };

    Calldatas.push(transferFromCalldata);

    const redeemData = vault.interface.encodeFunctionData(
      "redeem(uint256,address,address,uint256)",
      [amount, agentAddress, agentAddress, BigNumber.from(200)]
    );

    const redeemCalldata = {
      to: pool,
      data: redeemData,
      value: 0,
    };

    Calldatas.push(redeemCalldata);

    const asset = await vault.asset();
    TokensReturn.push(asset);

    console.log("::API Redeem:: Approvals", Approvals);
    console.log("::API Redeem:: Calldatas", Calldatas);
    console.log("::API Redeem:: TokensReturn", TokensReturn);

    return {
      Approvals,
      Calldatas,
      TokensReturn,
    };
  } catch (e) {
    pc.log(e);
  }
}

export async function accuredYearnInterest(
  pool: string,
  receiver: string,
  chainId: number
) {
  const provider = new ethers.providers.JsonRpcProvider(NETWORKS[chainId]);
  const vault = new ethers.Contract(pool, YEARN_VAULT_ABI, provider);
  const balanceVault = await vault.balanceOf(receiver);
  const balanceToken = await vault.previewWithdraw(balanceVault);
  const interest = BigNumber.from(balanceVault.sub(balanceToken));

  pc.log("::API:: 🏦 Balance Vault for " + pool + ":", balanceVault.toString());
  pc.log(
    "::API:: 🪙  Balance Token for " + pool + ":",
    balanceToken.toString()
  );
  pc.log("::API:: 💶 Accured interest for " + pool + ":", Number(interest));
  pc.log("::API:: Accured interest Calculation DONE!");

  return interest;
}

export async function previewWithdraw(
  pool: string,
  receiver: string,
  chainId: number
) {
  const provider = new ethers.providers.JsonRpcProvider(NETWORKS[chainId]);
  const vault = new ethers.Contract(pool, YEARN_VAULT_ABI, provider);
  const balanceVault = await vault.balanceOf(receiver);
  const balance = await vault.previewWithdraw(balanceVault);

  return balance;
}

export async function getVaultAsset(pool: string, chainId: number) {
  const provider = new ethers.providers.JsonRpcProvider(NETWORKS[chainId]);
  const vault = new ethers.Contract(pool, YEARN_VAULT_ABI, provider);
  const asset = await vault.asset();

  return asset;
}

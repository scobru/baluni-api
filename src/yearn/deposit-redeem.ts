import YEARN_VAULT_ABI from "../abis/yearn/YearnVault.json";
import ERC20ABI from "../abis/common/ERC20.json";
import { BigNumber, ContractInterface, ethers } from "ethers";
import { INFRA, NETWORKS } from "../constants";
import routerAbi from "../abis/infra/Router.json";
import { loadPrettyConsole } from "../utils/prettyConsole";

const pc = loadPrettyConsole();

export async function depositToYearn(
  wallet: ethers.Wallet,
  tokenAddr: string,
  pool: string,
  amount: BigNumber,
  receiver: string,
  chainId: string
) {
  try {
    const provider = new ethers.providers.JsonRpcProvider(NETWORKS[chainId]);
    const token = new ethers.Contract(tokenAddr, ERC20ABI, wallet);
    const vault = new ethers.Contract(pool, YEARN_VAULT_ABI, wallet);
    const tokenBalance = await token.balanceOf(receiver);
    const infraRouter = String(INFRA[chainId].ROUTER);
    const InfraRouterContract = new ethers.Contract(
      infraRouter,
      routerAbi,
      wallet
    );
    const agentAddress = await InfraRouterContract?.getAgentAddress(receiver);
    const gasLimit = 8000000;

    if (tokenBalance.lt(amount)) {
      throw new Error("::API:: Insufficient balance");
    }

    let Approvals = [];
    let Calldatas = [];
    let TokensReturn = [];

    const allowanceAgent = await token?.allowance(receiver, agentAddress);
    console.log("::API:: Agent Address", agentAddress);
    console.log(
      "::API:: Allowance for Agent",
      Number(allowanceAgent).toString()
    );

    // Sender Approval
    // -------------------------------------------------------------------------

    if (allowanceAgent.lt(amount)) {
      console.log("::API:: Approving Agent Address");
      const approveData = token.interface.encodeFunctionData("approve", [
        agentAddress,
        ethers.constants.MaxUint256,
      ]);

      const approvalCalldata = {
        to: token.address,
        value: 0,
        data: approveData,
        gasLimit: gasLimit,
        gasPrice: await provider.getGasPrice(),
      };

      const found = Approvals.find(
        (item) => item.to === token.address && item.data === approveData
      );

      if (!found) {
        Approvals.push(approvalCalldata);
      }
    } else {
      console.log("::API:: No need to approve Agent Address");
    }

    const allowanceYearn = await token?.allowance(agentAddress, pool);

    // Agents Calldatas
    // -------------------------------------------------------------------------
    if (allowanceYearn.lt(amount)) {
      console.log("::API:: Approving Yearn Vault");
      const approveData = token.interface.encodeFunctionData("approve", [
        pool,
        ethers.constants.MaxUint256,
      ]);

      const approvalCalldata = {
        to: token.address,
        value: 0,
        data: approveData,
        gasLimit: gasLimit,
        gasPrice: await provider.getGasPrice(),
      };

      const found = Approvals.find(
        (item) => item.to === token.address && item.data === approveData
      );

      if (!found) {
        Calldatas.push(approvalCalldata);
      }
    } else {
      console.log("::API:: No need to approve Yearn Vault");
    }

    // Transfer From
    // -------------------------------------------------------------------------
    console.log("::API:: Transfering from sender to agent");
    const transferFromData = token.interface.encodeFunctionData(
      "transferFrom",
      [receiver, agentAddress, amount]
    );

    const transferFromCalldata = {
      to: token.address,
      value: 0,
      data: transferFromData,
      gasLimit: gasLimit,
      gasPrice: await provider.getGasPrice(),
    };

    const found = Calldatas.find(
      (item) => item.to === token.address && item.data === transferFromData
    );

    if (!found) {
      Calldatas.push(transferFromCalldata);
    }

    // Deposit to Yearn
    // -------------------------------------------------------------------------
    const depositData = vault.interface.encodeFunctionData("deposit", [
      amount,
      agentAddress,
    ]);

    const depositCalldata = {
      to: pool,
      value: 0,
      data: depositData,
      gasLimit: gasLimit,
      gasPrice: await provider.getGasPrice(),
    };

    Calldatas.push(depositCalldata);
    TokensReturn.push(vault.address);

    return {
      Approvals,
      Calldatas,
      TokensReturn,
    };
  } catch (e) {
    console.log(e);
  }
}

export async function redeemFromYearn(
  wallet: ethers.Wallet,
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
      wallet
    );
    const vaultBalance = await vault.balanceOf(receiver);
    const gasLimit = 8000000;

    if (vaultBalance.lt(amount)) {
      throw new Error("::API:: Insufficient balance");
    }

    const infraRouter = String(INFRA[chainId].ROUTER);
    const InfraRouterContract = new ethers.Contract(
      infraRouter,
      routerAbi,
      wallet
    );
    const agentAddress = await InfraRouterContract?.getAgentAddress(receiver);

    let Approvals = [];
    let Calldatas = [];
    let TokensReturn = [];
    const allowanceAgent = await vault?.allowance(receiver, agentAddress);

    // Allowance for Agent
    // -------------------------------------------------------------------------
    if (allowanceAgent.lt(amount)) {
      console.log("::API:: Approving agent address");
      const approveData = vault.interface.encodeFunctionData("approve", [
        agentAddress,
        ethers.BigNumber.from(2).pow(256).sub(1),
      ]);

      const approvalCalldata = {
        to: vault.address,
        value: 0,
        data: approveData,
        gasLimit: gasLimit,
        gasPrice: await provider.getGasPrice(),
      };

      const found = Approvals.find(
        (item) => item.to === vault.address && item.data === approveData
      );

      if (!found) {
        Approvals.push(approvalCalldata);
      }
    } else {
      console.log("::API:: No need to approve agent address");
    }

    const allowanceAgentYearn = await vault?.allowance(agentAddress, pool);

    // Allowance for Yearn Vault
    // -------------------------------------------------------------------------
    if (allowanceAgentYearn.lt(amount)) {
      const approveData = vault.interface.encodeFunctionData("approve", [
        pool,
        ethers.BigNumber.from(2).pow(256).sub(1),
      ]);

      const approvalCalldata = {
        to: vault.address,
        value: 0,
        data: approveData,
        gasLimit: gasLimit,
        gasPrice: await provider.getGasPrice(),
      };

      const found = Approvals.find(
        (item) => item.to === vault.address && item.data === approveData
      );

      if (!found) {
        Calldatas.push(approvalCalldata);
      }
    } else {
      console.log("::API:: No need to approve Yearn Vault");
    }

    // Transfer From
    // -------------------------------------------------------------------------
    const transferFromData = vault.interface.encodeFunctionData(
      "transferFrom",
      [receiver, agentAddress, amount]
    );

    const transferFromCalldata = {
      to: vault.address,
      value: 0,
      data: transferFromData,
      gasLimit: gasLimit,
      gasPrice: await provider.getGasPrice(),
    };

    const found = Calldatas.find(
      (item) => item.to === vault.address && item.data === transferFromData
    );

    if (!found) {
      Calldatas.push(transferFromCalldata);
    }

    // Redeem
    // -------------------------------------------------------------------------
    const redeemData = vault.interface.encodeFunctionData(
      "redeem(uint256,address,address,uint256)",
      [amount, agentAddress, agentAddress, BigNumber.from(200)]
    );

    const redeemCalldata = {
      to: pool,
      value: 0,
      data: redeemData,
      gasLimit: gasLimit,
      gasPrice: await provider.getGasPrice(),
    };

    const foundRedeem = Calldatas.find(
      (item) => item.to === pool && item.data === redeemData
    );

    if (!foundRedeem) Calldatas.push(redeemCalldata);

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
    console.log(e);
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

  console.log(
    "::API:: 🏦 Balance Vault for " + pool + ":",
    balanceVault.toString()
  );
  console.log(
    "::API:: 🪙  Balance Token for " + pool + ":",
    balanceToken.toString()
  );
  console.log(
    "::API:: 💶 Accured interest for " + pool + ":",
    Number(interest)
  );
  console.log("::API:: Accured interest Calculation DONE!");

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

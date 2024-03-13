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
    const gasLimit = 9000000;
    const gasPrice = await provider?.getGasPrice();
    const gas = gasPrice.add(gasPrice.div(10));

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
        // gasLimit: gasLimit,
        // gasPrice: gas,
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
        // gasLimit: gasLimit,
        // gasPrice: gas,
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
      // gasLimit: gasLimit,
      // gasPrice: gas,
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
      // gasLimit: gasLimit,
      // gasPrice: gas,
    };

    Calldatas.push(depositCalldata);
    TokensReturn.push(vault.address);

    console.log("::API:: Approvals", Approvals.length);
    console.log("::API:: Calldatas", Calldatas.length);
    console.log("::API:: TokensReturn", TokensReturn.length);

    return {
      Approvals,
      Calldatas,
      TokensReturn,
    };
  } catch (e) {
    console.log(e);
  }
}

export async function depositToYearnBatched(
  deposits: Array<{
    wallet: ethers.Wallet;
    tokenAddr: string;
    pool: string;
    amount: BigNumber;
    receiver: string;
    chainId: string;
  }>
): Promise<{
  Approvals: Array<any>; // Specify the type argument for the Array type
  Calldatas: Array<any>;
  TokensReturn: Array<string>;
}> {
  let Approvals = [];
  let Calldatas = [];
  let TokensReturn = [];

  for (let i = 0; i < deposits.length; i++) {
    const pool = deposits[i].pool;
    const amount = deposits[i].amount;
    const wallet = deposits[i].wallet;
    const provider = new ethers.providers.JsonRpcProvider(
      NETWORKS[deposits[0].chainId]
    );
    const receiver = deposits[i].receiver;
    const tokenAddr = deposits[i].tokenAddr;
    const chainId = deposits[i].chainId;
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
    const gasLimit = 9000000;
    const gasPrice = await provider?.getGasPrice();
    const gas = gasPrice.add(gasPrice.div(10));

    if (tokenBalance.lt(amount)) {
      throw new Error("::API:: Insufficient balance");
    }

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
        // gasLimit: gasLimit,
        // gasPrice: gas,
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
        // gasLimit: gasLimit,
        // gasPrice: gas,
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
      // gasLimit: gasLimit,
      // gasPrice: gas,
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
      // gasLimit: gasLimit,
      // gasPrice: gas,
    };

    Calldatas.push(depositCalldata);
    TokensReturn.push(vault.address);
  }

  console.log("::API:: Approvals", Approvals.length);
  console.log("::API:: Calldatas", Calldatas.length);
  console.log("::API:: TokensReturn", TokensReturn.length);

  return {
    Approvals,
    Calldatas,
    TokensReturn,
  };
}

export async function redeemFromYearn(
  wallet: ethers.Wallet,
  pool: string,
  amount: BigNumber,
  receiver: string,
  chainId: string
) {
  try {
    const provider = new ethers.providers.JsonRpcProvider(NETWORKS[chainId]);
    const vault = new ethers.Contract(
      pool,
      YEARN_VAULT_ABI as ContractInterface,
      wallet
    );
    const vaultBalance = await vault.balanceOf(receiver);
    const gasLimit = 9000000;
    const gasPrice = await provider?.getGasPrice();
    const gas = gasPrice.add(gasPrice.div(10));

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
        ethers.constants.MaxUint256,
      ]);

      const approvalCalldata = {
        to: vault.address,
        value: 0,
        data: approveData,
        // gasLimit: gasLimit,
        // gasPrice: gas,
      };

      Approvals.push(approvalCalldata);
    } else {
      console.log("::API:: No need to approve agent address");
    }

    const allowanceAgentYearn = await vault?.allowance(agentAddress, pool);

    // Allowance for Yearn Vault
    // -------------------------------------------------------------------------
    if (allowanceAgentYearn.lt(amount)) {
      const approveData = vault.interface.encodeFunctionData("approve", [
        pool,
        ethers.constants.MaxUint256,
      ]);

      const approvalCalldata = {
        to: vault.address,
        value: 0,
        data: approveData,
        // gasLimit: gasLimit,
        // gasPrice: gas,
      };

      Calldatas.push(approvalCalldata);
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
      // gasLimit: gasLimit,
      // gasPrice: gas,
    };

    Calldatas.push(transferFromCalldata);

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
      // gasLimit: gasLimit,
      // gasPrice: gas,
    };

    const foundRedeem = Calldatas.find(
      (item) => item.to === pool && item.data === redeemData
    );

    if (!foundRedeem) Calldatas.push(redeemCalldata);

    const asset = await vault.asset();
    TokensReturn.push(asset);

    console.log("::API:: Approvals", Approvals.length);
    console.log("::API:: Calldatas", Calldatas.length);
    console.log("::API:: TokensReturn", TokensReturn.length);

    return {
      Approvals,
      Calldatas,
      TokensReturn,
    };
  } catch (e) {
    console.log(e);
  }
}

export async function redeemFromYearnBatched(
  redeems: Array<{
    wallet: ethers.Wallet;
    pool: string;
    amount: BigNumber;
    receiver: string;
    chainId: string;
  }>
): Promise<{
  Approvals: Array<any>;
  Calldatas: Array<any>;
  TokensReturn: Array<string>;
}> {
  let Approvals = [];
  let Calldatas = [];
  let TokensReturn = [];

  for (let i = 0; i < redeems.length; i++) {
    const pool = redeems[i].pool;
    const amount = redeems[i].amount;
    const wallet = redeems[i].wallet;
    const provider = new ethers.providers.JsonRpcProvider(
      NETWORKS[redeems[0].chainId]
    );
    const receiver = redeems[i].receiver;
    const chainId = redeems[i].chainId;
    const vault = new ethers.Contract(
      pool,
      YEARN_VAULT_ABI as ContractInterface,
      wallet
    );
    const vaultBalance = await vault.balanceOf(receiver);
    const gasLimit = 9000000;
    const gasPrice = await provider?.getGasPrice();
    const gas = gasPrice.add(gasPrice.div(10));

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
    const allowanceAgent = await vault?.allowance(receiver, agentAddress);

    // Allowance for Agent
    // -------------------------------------------------------------------------
    if (allowanceAgent.lt(amount)) {
      console.log("::API:: Approving agent address");
      const approveData = vault.interface.encodeFunctionData("approve", [
        agentAddress,
        ethers.constants.MaxUint256,
      ]);

      const approvalCalldata = {
        to: vault.address,
        value: 0,
        data: approveData,
      };

      Approvals.push(approvalCalldata);
    } else {
      console.log("::API:: No need to approve agent address");
    }

    const allowanceAgentYearn = await vault?.allowance(agentAddress, pool);

    // Allowance for Yearn Vault
    // -------------------------------------------------------------------------
    if (allowanceAgentYearn.lt(amount)) {
      const approveData = vault.interface.encodeFunctionData("approve", [
        pool,
        ethers.constants.MaxUint256,
      ]);

      const approvalCalldata = {
        to: vault.address,
        value: 0,
        data: approveData,
      };

      Calldatas.push(approvalCalldata);
    } else {
      console.log("::API:: No need to approve Yearn Vault");
    }

    // Transfer From
    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------

    const transferFromData = vault.interface.encodeFunctionData(
      "transferFrom",
      [receiver, agentAddress, amount]
    );

    const transferFromCalldata = {
      to: vault.address,
      value: 0,
      data: transferFromData,
    };

    Calldatas.push(transferFromCalldata);

    // Redeem
    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------

    const redeemData = vault.interface.encodeFunctionData(
      "redeem(uint256,address,address,uint256)",
      [amount, agentAddress, agentAddress, BigNumber.from(200)]
    );

    const redeemCalldata = {
      to: pool,
      value: 0,
      data: redeemData,
    };

    Calldatas.push(redeemCalldata);

    const asset = await vault.asset();
    TokensReturn.push(asset);
  }
  console.log("::API:: Approvals", Approvals.length);
  console.log("::API:: Calldatas", Calldatas.length);
  console.log("::API:: TokensReturn", TokensReturn.length);

  return {
    Approvals,
    Calldatas,
    TokensReturn,
  };
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

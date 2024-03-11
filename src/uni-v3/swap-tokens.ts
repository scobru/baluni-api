import { Contract, Wallet, ethers } from "ethers";
import erc20Abi from "../abis/common/ERC20.json";
import swapRouterAbi from "../abis/uniswap/SwapRouter.json";
import routerAbi from "../abis/infra/Router.json";
import quoterAbi from "../abis/uniswap/Quoter.json";
import { PROTOCOLS, NETWORKS, INFRA, NATIVETOKENS, USDC } from "../constants";
import { BigNumber } from "bignumber.js";
import { findPoolAndFee } from "./utils/getPoolFee";
import { quotePair } from "./utils/quote";
import env from "dotenv";
import { parseUnits } from "ethers/lib/utils";

env.config();

function getAdjAmount(_amount, _decimals) {
  let _adjAmount;

  if (_decimals == 18) {
    _adjAmount = parseUnits(_amount, 18);
  } else if (_decimals == 6) {
    _adjAmount = parseUnits(_amount, 6);
  } else if (_decimals == 8) {
    _adjAmount = parseUnits(_amount, 8);
  }

  return _adjAmount;
}

export async function buildSwap(
  wallet: Wallet,
  address: string,
  token0: string,
  token1: string,
  reverse: boolean,
  protocol: string,
  chainId: string,
  amount: string,
  slippage: number
) {
  console.log("Building Swap tx");

  const quoter = String(PROTOCOLS[chainId][protocol].QUOTER);
  const uniRouter = String(PROTOCOLS[chainId][protocol].ROUTER);
  const swapRouterContract = new Contract(uniRouter, swapRouterAbi, wallet);
  const infraRouter = String(INFRA[chainId].ROUTER);
  const InfraRouterContract = new Contract(infraRouter, routerAbi, wallet);
  const agentAddress = await InfraRouterContract?.getAgentAddress(address);
  const tokenAAddress = reverse == true ? token1 : token0;
  const tokenBAddress = reverse == true ? token0 : token1;
  const tokenAContract = new Contract(tokenAAddress, erc20Abi, wallet);
  const tokenADecimals = await tokenAContract.decimals();

  // const tokenBContract = new Contract(tokenBAddress, erc20Abi, provider);
  // const tokenBDecimals = await tokenBContract.decimals();

  const gasLimit = 8000000;

  let Approvals = [];
  let Calldatas = [];
  let adjAmount: any = ethers.BigNumber.from(0);

  console.log("Adj Amount: ", Number(amount));
  console.log("Token A Decimals: ", Number(tokenADecimals));

  if (tokenADecimals == 0) {
    throw new Error("Invalid Token Decimals");
  }
  adjAmount = getAdjAmount(amount, tokenADecimals);

  if (adjAmount == 0) {
    throw new Error("Invalid Token Decimals");
  }

  const quoterContract = new Contract(quoter, quoterAbi, wallet);
  const quote = await quotePair(tokenAAddress, tokenBAddress, Number(chainId));
  const allowanceAgent = await tokenAContract?.allowance(address, agentAddress);
  const slippageTolerance = slippage;

  console.log("::API:: Infra Router Address", infraRouter);
  console.log("::API:: Uni Router Address", uniRouter);
  console.log("::API:: Agent Address", agentAddress);

  // Allowance for Sender to Router
  // -------------------

  // if (adjAmount > allowanceRouter) {
  //   console.log("::API:: Sender does not have enough allowance");
  //   const dataApproveToRouter = tokenAContract.interface.encodeFunctionData(
  //     "approve",
  //     [uniRouter, ethers.BigNumber.from(2).pow(256).sub(1)]
  //   );
  //   const approvalToRouter = {
  //     to: tokenAAddress,
  //     value: 0,
  //     data: dataApproveToRouter,
  //     gasLimit: gasLimit,
  //     gasPrice: gas,
  //   };
  //   Approvals.push(approvalToRouter);
  // }

  // Allowance for Sender to Agent
  // ----------------------------------------------------------------------------
  // ----------------------------------------------------------------------------

  if (allowanceAgent && adjAmount > allowanceAgent) {
    console.log("::API:: Agent does not have enough allowance");
    const dataApproveToAgent = tokenAContract.interface.encodeFunctionData(
      "approve",
      [agentAddress, adjAmount]
    );

    const approvalToAgent = {
      to: tokenAAddress,
      value: 0,
      data: dataApproveToAgent,
      gasLimit: gasLimit,
      gasPrice: await wallet.provider?.getGasPrice(),
    };

    const found = Approvals.find(
      (element) =>
        element.data === approvalToAgent.data &&
        element.to === approvalToAgent.to
    );

    if (!found) Approvals.push(approvalToAgent);
  } else {
    console.log("::API:: Agent has enough allowance for Sender");
  }

  const allowanceAgentToRouter = await tokenAContract?.allowance(
    agentAddress,
    uniRouter
  );

  // Allowance for Agent to Univ3
  // ----------------------------------------------------------------------------
  // ----------------------------------------------------------------------------

  if (adjAmount > allowanceAgentToRouter && allowanceAgentToRouter) {
    console.log("::API:: Agent does not have enough allowance for Uni Router");
    const calldataApproveAgentToRouter =
      tokenAContract.interface.encodeFunctionData("approve", [
        uniRouter,
        adjAmount,
      ]);

    const approvalAgentToRouter = {
      to: tokenAAddress,
      value: 0,
      data: calldataApproveAgentToRouter,
      gasLimit: gasLimit,
      gasPrice: await wallet.provider?.getGasPrice(),
    };

    const found = Calldatas.find(
      (element) =>
        element.data === approvalAgentToRouter.data &&
        element.to === approvalAgentToRouter.to
    );

    if (!found) Calldatas.push(approvalAgentToRouter);
  } else {
    console.log("::API:: Agent has enough allowance for Uni Router");
  }

  // Transfer tokens from Sender to Agent
  // ----------------------------------------------------------------------------
  // ----------------------------------------------------------------------------
  console.log("::API:: Transfering tokens from sender to agent CallData");
  const dataTransferFromSenderToAgent =
    tokenAContract.interface.encodeFunctionData("transferFrom", [
      address!,
      agentAddress,
      adjAmount,
    ]);

  const transferFromSenderToAgent = {
    to: tokenAAddress,
    value: 0,
    data: dataTransferFromSenderToAgent,
    gasLimit: gasLimit,
    gasPrice: await wallet.provider?.getGasPrice(),
  };

  const found = Calldatas.find(
    (element) =>
      element.data === dataTransferFromSenderToAgent &&
      element.to === tokenAAddress
  );

  if (!found) Calldatas.push(transferFromSenderToAgent);

  // Encode Swap tx to Uni Router
  // ----------------------------------------------------------------------------
  // ----------------------------------------------------------------------------

  console.log("::API:: Encode Swap CallData To Uni Router");

  if (!quote) {
    console.error("❌ USDC Pool Not Found");
    console.log("↩️ Using WMATIC route");
    const poolFee = await findPoolAndFee(
      quoterContract,
      tokenAAddress,
      NATIVETOKENS[chainId].WRAPPED,
      adjAmount,
      slippageTolerance
    );

    const poolFee2 = await findPoolAndFee(
      quoterContract,
      NATIVETOKENS[chainId].WRAPPED,
      tokenBAddress,
      adjAmount,
      slippageTolerance
    );

    let swapDeadline = Math.floor(Date.now() / 1000 + 60 * 60);

    const path = ethers.utils.solidityPack(
      ["address", "uint24", "address", "uint24", "address"],
      [
        tokenAAddress,
        poolFee,
        NATIVETOKENS[chainId].WRAPPED,
        poolFee2,
        tokenBAddress,
      ]
    );

    let swapTxInputs = [path, agentAddress, swapDeadline, adjAmount, 0];

    console.log("::API:: Building Swap tx");

    const calldataSwapAgentToRouter =
      swapRouterContract.interface.encodeFunctionData("exactInput", [
        swapTxInputs,
      ]);

    const swapMultiAgentToRouter = {
      to: PROTOCOLS[chainId][protocol].ROUTER as string,
      value: 0,
      data: calldataSwapAgentToRouter,
    };

    Calldatas.push(swapMultiAgentToRouter);
  } else {
    const swapDeadline = Math.floor(Date.now() / 1000 + 60 * 60);
    const poolFee = await findPoolAndFee(
      quoterContract,
      tokenAAddress,
      tokenBAddress,
      adjAmount,
      slippageTolerance
    );

    const expectedAmountB: BigNumber =
      await quoterContract?.callStatic?.quoteExactInputSingle?.(
        tokenAAddress,
        tokenBAddress,
        poolFee,
        adjAmount,
        0
      );
    const minimumAmountB = ethers.BigNumber.from(expectedAmountB)
      .mul(10000 - slippageTolerance)
      .div(10000);

    const swapTxInputs = [
      tokenAAddress,
      tokenBAddress,
      poolFee,
      agentAddress!,
      swapDeadline,
      adjAmount,
      minimumAmountB,
      0,
    ];

    console.log("::API:: Building Swap tx");
    const calldataSwapAgentToRouter =
      swapRouterContract.interface.encodeFunctionData("exactInputSingle", [
        swapTxInputs,
      ]);

    const swapAgentToRouter = {
      to: uniRouter,
      value: 0,
      data: calldataSwapAgentToRouter,
      gasLimit: gasLimit,
      gasPrice: await wallet.provider?.getGasPrice(),
    };

    const found = Calldatas.find(
      (element) =>
        element.data === calldataSwapAgentToRouter && element.to === uniRouter
    );

    if (!found) Calldatas.push(swapAgentToRouter);
  }

  const TokensReturn = [tokenBAddress];

  return {
    Approvals,
    Calldatas,
    TokensReturn,
  };
}

export async function buildBatchSwap(
  swaps: Array<{
    wallet: Wallet;
    address: string;
    token0: string;
    token1: string;
    reverse: boolean;
    protocol: string;
    chainId: string;
    amount: string;
    slippage: number;
  }>
) {
  console.log("Building Batch Swap tx");
  const provider = new ethers.providers.JsonRpcProvider(
    NETWORKS[swaps[0].chainId]
  );
  const wallet = swaps[0].wallet;
  const protocol = PROTOCOLS[swaps[0].chainId][swaps[0].protocol];
  const infraRouter = String(INFRA[swaps[0].chainId].ROUTER);
  const InfraRouterContract = new Contract(infraRouter, routerAbi, wallet);
  const uniRouter = String(protocol.ROUTER);
  const swapRouterContract = new Contract(uniRouter, swapRouterAbi, wallet);
  const quoter = String(protocol.QUOTER);
  const quoterContract = new Contract(quoter, quoterAbi, wallet);
  const gasLimit = 8000000;

  let Approvals = [];
  let Calldatas = [];
  let TokensReturn = [];

  console.log("::API:: Infra Router Address", infraRouter);
  console.log("::API:: Uni Router Address", uniRouter);

  for (let swap of swaps) {
    const agentAddress = await InfraRouterContract?.getAgentAddress(
      swap.address
    );
    console.log("::API:: Agent Address", agentAddress);
    const tokenAAddress = swap.reverse ? swap.token1 : swap.token0;
    const tokenBAddress = swap.reverse ? swap.token0 : swap.token1;
    const tokenAContract = new Contract(tokenAAddress, erc20Abi, wallet);

    const allowanceAgent = await tokenAContract?.allowance(
      swap.address,
      agentAddress
    );

    const tokenADecimals = await tokenAContract?.decimals();
    let adjAmount: any = ethers.BigNumber.from(0);

    adjAmount = getAdjAmount(swap.amount, tokenADecimals);

    if (adjAmount == 0) {
      throw new Error("Invalid Token Decimals");
    }

    // Allowance for Agent to Sender
    // ----------------------------------------------------------------------------
    // ----------------------------------------------------------------------------

    if (Number(adjAmount) > Number(allowanceAgent)) {
      console.log("::API:: Agent does not have enough allowance");
      const dataApproveToAgent = tokenAContract?.interface.encodeFunctionData(
        "approve",
        [agentAddress, ethers.constants.MaxUint256]
      );

      const approvalToAgent = {
        to: tokenAAddress,
        value: 0,
        data: dataApproveToAgent,
        gasLimit: gasLimit,
        gasPrice: await wallet.provider?.getGasPrice(),
      };

      // check if dataApproveToAgent e to sono in approvals
      const found = Approvals.find(
        (element) =>
          element.data === approvalToAgent.data &&
          element.to === approvalToAgent.to
      );

      Approvals.push(approvalToAgent);
    } else {
      console.log("::API:: Agent has enough allowance for Sender");
    }

    // Check allowance Router to UniRouter
    // ----------------------------------------------------------------------------
    // ----------------------------------------------------------------------------

    const allowanceAgentToUniRouter = await tokenAContract?.allowance(
      agentAddress,
      uniRouter
    );

    if (
      Number(adjAmount) > Number(allowanceAgentToUniRouter) &&
      allowanceAgentToUniRouter
    ) {
      console.log(
        "::API:: Agent does not have enough allowance for Uni Router"
      );

      const calldataApproveAgentToRouter =
        tokenAContract.interface.encodeFunctionData("approve", [
          uniRouter,
          ethers.constants.MaxUint256,
        ]);

      const approvalAgentToRouter = {
        to: tokenAAddress,
        value: 0,
        data: calldataApproveAgentToRouter,
        gasLimit: gasLimit,
        gasPrice: await wallet.provider?.getGasPrice(),
      };

      Calldatas.push(approvalAgentToRouter);
    } else {
      console.log("::API:: Agent has enough allowance for Uni Router");
    }

    // Transfer tokens from Sender to Agent
    // ----------------------------------------------------------------------------
    // ----------------------------------------------------------------------------

    const dataTransferFromSenderToAgent =
      tokenAContract.interface.encodeFunctionData("transferFrom", [
        swap.address,
        agentAddress,
        adjAmount,
      ]);

    const transferFromSenderToAgent = {
      to: tokenAAddress,
      value: 0,
      data: dataTransferFromSenderToAgent,
      gasLimit: gasLimit,
      gasPrice: await wallet.provider?.getGasPrice(),
    };

    Calldatas.push(transferFromSenderToAgent);

    // Encode Swap tx to Uni Router
    // ----------------------------------------------------------------------------
    // ----------------------------------------------------------------------------

    const quote = await quotePair(
      tokenAAddress,
      tokenBAddress,
      Number(swap.chainId)
    );

    const slippageTolerance = swap.slippage;

    if (!quote) {
      console.error("❌ USDC Pool Not Found");
      console.log("↩️ Using WMATIC route");

      const poolFee = await findPoolAndFee(
        quoterContract,
        tokenAAddress,
        NATIVETOKENS[swap.chainId].WRAPPED,
        adjAmount,
        slippageTolerance
      );

      const poolFee2 = await findPoolAndFee(
        quoterContract,
        NATIVETOKENS[swap.chainId].WRAPPED,
        tokenBAddress,
        adjAmount,
        slippageTolerance
      );

      let swapDeadline = Math.floor(Date.now() / 1000 + 60 * 60); // 1 hour from now

      const path = ethers.utils.solidityPack(
        ["address", "uint24", "address", "uint24", "address"],
        [
          tokenAAddress,
          poolFee,
          NATIVETOKENS[swap.chainId].WRAPPED,
          poolFee2,
          tokenBAddress,
        ]
      );

      let swapTxInputs = [path, agentAddress, swapDeadline, adjAmount, 0];

      const calldataSwapAgentToRouter =
        swapRouterContract.interface.encodeFunctionData("exactInput", [
          swapTxInputs,
        ]);

      const swapMultiAgentToRouter = {
        to: uniRouter,
        value: 0,
        data: calldataSwapAgentToRouter,
        gasLimit: gasLimit,
        gasPrice: await wallet.provider?.getGasPrice(),
      };

      const found = Calldatas.find(
        (element) =>
          element.data === calldataSwapAgentToRouter && element.to === uniRouter
      );

      Calldatas.push(swapMultiAgentToRouter);

      TokensReturn.push(tokenBAddress);
    } else {
      const swapDeadline = Math.floor(Date.now() / 1000 + 60 * 60);
      const quoterAddress = quoter;
      const quoterContract = new Contract(quoterAddress, quoterAbi, provider);
      const slippageTolerance = swap.slippage;

      const poolFee = await findPoolAndFee(
        quoterContract,
        tokenAAddress,
        tokenBAddress,
        adjAmount,
        slippageTolerance
      );

      const expectedAmountB: BigNumber =
        await quoterContract?.callStatic?.quoteExactInputSingle?.(
          tokenAAddress,
          tokenBAddress,
          poolFee,
          adjAmount,
          0
        );

      const minimumAmountB = ethers.BigNumber.from(expectedAmountB)
        .mul(10000 - slippageTolerance)
        .div(10000);

      const swapTxInputs = [
        tokenAAddress,
        tokenBAddress,
        poolFee,
        agentAddress!,
        swapDeadline,
        adjAmount,
        minimumAmountB,
        0,
      ];

      const calldataSwapAgentToRouter =
        swapRouterContract.interface.encodeFunctionData("exactInputSingle", [
          swapTxInputs,
        ]);

      const swapAgentToRouter = {
        to: uniRouter,
        value: 0,
        data: calldataSwapAgentToRouter,
        gasLimit: gasLimit,
        gasPrice: await wallet.provider?.getGasPrice(),
      };

      const found = Calldatas.find(
        (element) =>
          element.data === calldataSwapAgentToRouter && element.to === uniRouter
      );

      if (!found) {
        console.log("::API:: Adding Swap Agent to Router");
        Calldatas.push(swapAgentToRouter);
      }
      TokensReturn.push(tokenBAddress);
    }
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

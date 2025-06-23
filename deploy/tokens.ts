import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { currencyIterator, mocks } from '../utils/currencies';
import {
  executeIfNewlyDeployment,
  getWaitConfirmations,
} from '../utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const waitConfirmations = getWaitConfirmations();

  // Deploy mock tokens
  const log = {};
  const logHeader = 'Contract Addresses';
  let hasNativeToken = false;

  for (const currency of currencyIterator()) {
    if (currency.isNative) {
      hasNativeToken = true;
    }

    if (currency.tokenAddress) {
      console.log(`${currency.symbol} uses the existing address`);
      log[currency.symbol] = { [logHeader]: currency.tokenAddress };
      continue;
    }

    const tokenDeployResult = await deploy(mocks[currency.symbol].tokenName, {
      from: deployer,
      args: currency.isNative ? [] : currency.args,
      waitConfirmations,
    });
    log[currency.symbol] = { [logHeader]: tokenDeployResult.address };

    await executeIfNewlyDeployment(
      mocks[currency.symbol].tokenName,
      tokenDeployResult,
    );
  }

  if (!process.env.NATIVE_TOKEN_ADDRESS && !hasNativeToken) {
    const deployResult = await deploy('MockWETH9', {
      from: deployer,
      waitConfirmations,
    });
    await executeIfNewlyDeployment('MockWETH9', deployResult);
  }

  console.table(log);

  // Deploy TokenFaucet
  if (process.env.ENABLE_FAUCET === 'true') {
    const faucetDeployResult = await deploy('TokenFaucet', {
      from: deployer,
      waitConfirmations,
    });

    await executeIfNewlyDeployment(
      'TokenFaucet',
      faucetDeployResult,
      async () => {
        const tokenFaucetContract = await ethers.getContractAt(
          'TokenFaucet',
          faucetDeployResult.address,
        );

        for (const currency of currencyIterator()) {
          const mock = mocks[currency.symbol];
          const tokenAddress =
            currency.tokenAddress ||
            (await deployments.get(mock.tokenName)).address;

          if (
            !currency.isNative &&
            (await tokenFaucetContract.getCurrencyAddress(currency.key)) !==
              tokenAddress
          ) {
            const mockTokenContract = await ethers.getContractAt(
              mock.tokenName,
              tokenAddress,
            );

            // set the maximum amount per mint for a user wallet as 1/10,000 of the initial token amount
            await tokenFaucetContract
              .registerCurrency(
                currency.key,
                tokenAddress,
                ethers.BigNumber.from(currency.args?.[0]).div(10000),
              )
              .then((tx) => tx.wait(waitConfirmations));

            await mockTokenContract
              .setMinterRole(faucetDeployResult.address)
              .then((tx) => tx.wait(waitConfirmations));
          }
        }
      },
    );
  }
};

func.tags = ['Tokens'];

export default func;

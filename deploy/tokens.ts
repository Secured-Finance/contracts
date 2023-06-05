import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { currencies } from '../utils/currencies';
import { executeIfNewlyDeployment } from '../utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Deploy mock tokens
  const log = {};
  const logHeader = 'Contract Addresses';

  for (const currency of currencies) {
    if (currency.env) {
      console.log(`${currency.symbol} uses the existing address`);
      log[currency.symbol] = { [logHeader]: currency.env };
      continue;
    }

    const tokenDeployResult = await deploy(currency.mock, {
      from: deployer,
      args: currency.args,
    });
    log[currency.symbol] = { [logHeader]: tokenDeployResult.address };

    await executeIfNewlyDeployment(currency.mock, tokenDeployResult);
  }

  console.table(log);

  // Deploy TokenFaucet
  if (process.env.ENABLE_FAUCET === 'true') {
    const faucetDeployResult = await deploy('TokenFaucet', { from: deployer });

    await executeIfNewlyDeployment(
      'TokenFaucet',
      faucetDeployResult,
      async () => {
        const tokenFaucetContract = await ethers.getContractAt(
          'TokenFaucet',
          faucetDeployResult.address,
        );

        for (const currency of currencies) {
          const mockToken =
            currency.env || (await deployments.get(currency.mock)).address;

          if (
            currency.symbol !== 'WETH' &&
            (await tokenFaucetContract.getCurrencyAddress(currency.key)) !==
              mockToken
          ) {
            const mockTokenContract = await ethers.getContractAt(
              currency.mock,
              mockToken,
            );

            // set the maximum amount per mint for a user wallet as 1/10,000 of the initial token amount
            await tokenFaucetContract
              .registerCurrency(
                currency.key,
                mockToken,
                ethers.BigNumber.from(currency.args?.[0]).div(10000),
              )
              .then((tx) => tx.wait());

            await mockTokenContract
              .setMinterRole(faucetDeployResult.address)
              .then((tx) => tx.wait());
          }
        }
      },
    );
  }
};

func.tags = ['Tokens'];

export default func;

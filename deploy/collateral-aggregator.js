const { executeIfNewlyDeployment } = require('../test-utils').deployment;

const MARGIN_CALL_THRESHOLD_RATE = 15000;
const AUTO_LIQUIDATION_THRESHOLD_RATE = 12500;
const LIQUIDATION_PRICE_RATE = 12000;
const MIN_COLLATERAL_RATE = 2500;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const deployResult = await deploy('CollateralAggregator', {
    from: deployer,
  });

  await executeIfNewlyDeployment(
    'CollateralAggregator',
    deployResult,
    async () => {
      const proxyController = await deployments
        .get('ProxyController')
        .then(({ address }) =>
          ethers.getContractAt('ProxyController', address),
        );

      await proxyController
        .setCollateralAggregatorImpl(
          deployResult.address,
          MARGIN_CALL_THRESHOLD_RATE,
          AUTO_LIQUIDATION_THRESHOLD_RATE,
          LIQUIDATION_PRICE_RATE,
          MIN_COLLATERAL_RATE,
        )
        .then((tx) => tx.wait());
    },
  );
};

module.exports.tags = ['CollateralAggregator'];
module.exports.dependencies = ['ProxyController'];

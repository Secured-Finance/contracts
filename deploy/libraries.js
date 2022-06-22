const { executeIfNewlyDeployment } = require('../test-utils').deployment;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy('DealId', {
    from: deployer,
  }).then((result) => executeIfNewlyDeployment('DealId', result));

  await deploy('QuickSort', {
    from: deployer,
  }).then((result) => executeIfNewlyDeployment('QuickSort', result));

  await deploy('DiscountFactor', {
    from: deployer,
  }).then((result) => executeIfNewlyDeployment('DiscountFactor', result));
};

module.exports.tags = ['Libraries'];

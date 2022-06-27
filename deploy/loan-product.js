const { executeIfNewlyDeployment } = require('../test-utils').deployment;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const dealIdLibrary = await deployments.get('DealId');
  const discountFactorLibrary = await deployments.get('DiscountFactor');

  const deployResult = await deploy('LoanV2', {
    from: deployer,
    libraries: {
      DiscountFactor: discountFactorLibrary.address,
      DealId: dealIdLibrary.address,
    },
  });

  await executeIfNewlyDeployment('LoanV2', deployResult, async () => {
    const proxyController = await deployments
      .get('ProxyController')
      .then(({ address }) => ethers.getContractAt('ProxyController', address));

    await proxyController
      .setLoanImpl(deployResult.address)
      .then((tx) => tx.wait());
  });
};

module.exports.tags = ['Loan'];
module.exports.dependencies = ['Libraries', 'ProxyController'];

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const dealIdLibrary = await deployments.get('DealId');
  const discountFactorLibrary = await deployments.get('DiscountFactor');

  const loanV2 = await deploy('LoanV2', {
    from: deployer,
    libraries: {
      DiscountFactor: discountFactorLibrary.address,
      DealId: dealIdLibrary.address,
    },
  });
  console.log('Deployed LoanV2 at ' + loanV2.address);

  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));

  await proxyController.setLoanImpl(loanV2.address).then((tx) => tx.wait());
};

module.exports.tags = ['Loan'];
module.exports.dependencies = ['Libraries', 'ProxyController'];

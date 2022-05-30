module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const dealIdLibrary = await deployments.get('DealId');
  const discountFactorLibrary = await deployments.get('DiscountFactor');
  const addressResolver = await deployments.get('AddressResolver');

  const loanV2 = await deploy('LoanV2', {
    from: deployer,
    args: [addressResolver.address],
    libraries: {
      DiscountFactor: discountFactorLibrary.address,
      DealId: dealIdLibrary.address,
    },
  });
  console.log('Deployed LoanV2 at ' + loanV2.address);
};

module.exports.tags = ['Loan'];
module.exports.dependencies = ['AddressResolver', 'Libraries'];

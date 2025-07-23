# Contributing to USDFC

Thank you for your interest in contributing to the USDFC project! This document outlines the guidelines and processes for contributing to this repository.

## Getting Started

1. **Fork the repository** and clone it to your local machine
2. **Use established node version** by running `nvm use`
3. **Create environment file** by referring to `.env.sample` and creating `.env`
4. **Install dependencies** by running `npm install`

## Development Workflow

### 1. Create an Issue First

Before starting any work, please create an issue on GitHub describing:

- The problem you're trying to solve
- Your proposed solution
- Any relevant context or additional information

This helps maintain project coordination and prevents duplicate work.

### 2. Create a Feature Branch

Create a new branch from the main branch for your work:

```bash
git checkout -b feature/your-feature-name
```

### 3. Code Standards

#### Commit Message Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/) specification. All commit messages must:

- Follow the format: `type(scope): description [#issue-number]`
- **Must include the GitHub issue ID** in the format `#123` (where 123 is the issue number)
- Use one of the following types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`

**Example commit messages:**

```
feat: add new collateral type support [#123]
fix: resolve trove liquidation calculation error [#456]
docs: update API documentation for stability pool [#789]
test: add unit tests for price feed integration [#012]
chore: update dependencies to latest versions [#345]
```

The commit message format is enforced by commitlint, which requires:

- Issue references with "#" prefix (e.g., #123)
- Conventional commit format compliance

#### Code Formatting and Linting

Before committing your changes, ensure your code is properly formatted and linted:

```bash
# Check code style and formatting
npm run check

# Automatically fix linting and formatting issues
npm run fix
```

The project uses:

- **ESLint** for JavaScript code linting
- **Prettier** for code formatting (JavaScript, JSON, and Solidity files)
- **Solidity** formatting via prettier-plugin-solidity

#### Solidity Code Standards

- Follow the [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html)
- Use descriptive variable and function names
- Include appropriate comments for complex logic
- Ensure all contracts compile without warnings
- Write comprehensive tests for new functionality

### 4. Testing

Before submitting your pull request:

```bash
# Run all tests
npm test

# Check test coverage
npm run coverage
```

Ensure that:

- All existing tests pass
- New functionality includes appropriate tests
- Test coverage remains high

### 5. Security Considerations

Given the financial nature of this project:

- Never commit private keys, mnemonics, or sensitive configuration
- Follow secure coding practices
- Consider potential attack vectors in your implementation
- Test edge cases thoroughly
- Review the existing audit reports in the `audits/` directory

## Pull Request Process

### 1. Before Submitting

Ensure your pull request:

- [ ] References the related GitHub issue
- [ ] Includes a clear description of changes
- [ ] Has been tested locally
- [ ] Passes all linting and formatting checks
- [ ] Includes appropriate tests
- [ ] Updates documentation if necessary

### 2. Pull Request Template

When creating a pull request:

**Title:** Brief description of changes
**Description:**

- Link to related issue: Closes #[issue-number]
- Summary of changes made
- Any breaking changes or migration notes
- Screenshots or examples (if applicable)

### 3. Review Process

- All pull requests require review from project maintainers
- Address any feedback provided during review
- Ensure CI/CD checks pass
- Maintain a clean commit history (squash commits if requested)

## Development Scripts

```bash
# Development setup
npm run prepare              # Set up development environment
npm run hardhat             # Access Hardhat CLI

# Code quality
npm run check               # Run all checks (lint + prettier)
npm run check:lint          # Check ESLint rules
npm run check:prettier      # Check Prettier formatting
npm run fix                 # Fix all auto-fixable issues
npm run fix:lint            # Fix ESLint issues
npm run fix:prettier        # Fix Prettier formatting

# Testing
npm test                    # Run test suite
npm run coverage           # Generate test coverage report
```

## Project Structure

```
contracts/           # Solidity smart contracts
├── Dependencies/    # External dependencies and interfaces
├── Interfaces/      # Contract interfaces
├── ProtocolToken/   # Protocol token related contracts
├── Proxy/          # Testing proxy contracts and scripts
└── TestContracts/  # Testing utilities and mock contracts

test/               # JavaScript test files
deployments/        # Deployment scripts and configurations
audits/            # Security audit reports
scripts/           # Utility scripts
```

## Additional Resources

- [Hardhat Documentation](https://hardhat.org/docs)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Solidity Documentation](https://docs.soliditylang.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)

## Questions or Issues?

If you have questions about contributing, please:

1. Check existing issues and discussions
2. Create a new issue with your question
3. Reach out to the maintainers

Thank you for contributing to Secured Finance Stablecoin Contracts!

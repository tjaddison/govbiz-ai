# GovBiz.ai Documentation

This directory contains comprehensive documentation for the GovBiz.ai government contracting automation platform.

## Documentation Structure

### Core Documentation
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Complete system architecture and design
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Deployment guide and procedures
- **[MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)** - Migration from Sources Sought AI to GovBiz.ai

### Setup Documentation (`setup/`)
- **[AWS_SECRETS_CONFIG.md](setup/AWS_SECRETS_CONFIG.md)** - AWS Secrets Manager and AppConfig setup
- **[AGENT_EMAIL_CONFIGURATION.md](setup/AGENT_EMAIL_CONFIGURATION.md)** - Email configuration for agents

### Integration Documentation (`integration/`)
- **[SLACK_INTEGRATION.md](integration/SLACK_INTEGRATION.md)** - Slack integration and human-in-the-loop setup
- **[CSV_PROCESSING.md](integration/CSV_PROCESSING.md)** - SAM.gov CSV processing configuration

## Getting Started

1. **New Users**: Start with [ARCHITECTURE.md](ARCHITECTURE.md) for system overview
2. **Deployment**: Follow [DEPLOYMENT.md](DEPLOYMENT.md) for installation
3. **Configuration**: Review setup guides in the `setup/` folder
4. **Integrations**: Configure external services using guides in `integration/`

## Quick Navigation

### By Use Case
- **Understanding the System**: [ARCHITECTURE.md](ARCHITECTURE.md)
- **Setting Up Development**: [DEPLOYMENT.md](DEPLOYMENT.md) → Quick Start
- **Production Deployment**: [DEPLOYMENT.md](DEPLOYMENT.md) → Production Deployment
- **Configuring Email**: [setup/AGENT_EMAIL_CONFIGURATION.md](setup/AGENT_EMAIL_CONFIGURATION.md)
- **Setting Up Slack**: [integration/SLACK_INTEGRATION.md](integration/SLACK_INTEGRATION.md)
- **Migrating from Old System**: [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)

### By Role
- **Developers**: ARCHITECTURE.md → DEPLOYMENT.md → setup/
- **DevOps Engineers**: DEPLOYMENT.md → setup/AWS_SECRETS_CONFIG.md
- **System Administrators**: All setup/ and integration/ docs
- **Business Users**: ARCHITECTURE.md → integration/SLACK_INTEGRATION.md

## Additional Resources

- **[CHANGELOG.md](../CHANGELOG.md)** - Version history and changes
- **[CLAUDE.md](../CLAUDE.md)** - Sources Sought domain expertise
- **[README.md](../README.md)** - Project overview and quick start
- **[MCP Servers Documentation](../mcp-servers/README.md)** - Technical MCP server details

## Documentation Standards

All documentation in this project follows:
- **Markdown format** with consistent styling
- **Clear headings** and logical structure
- **Code examples** with proper syntax highlighting
- **Cross-references** between related documents
- **Keep a Changelog** format for version history

## Contributing

When updating documentation:
1. Follow the existing structure and naming conventions
2. Update cross-references when moving or renaming files
3. Add entries to [CHANGELOG.md](../CHANGELOG.md) for significant changes
4. Test all code examples and commands
5. Ensure documentation is accessible to the target audience

## Support

For questions about documentation:
- **Technical Issues**: Check [DEPLOYMENT.md](DEPLOYMENT.md) troubleshooting section
- **Architecture Questions**: Review [ARCHITECTURE.md](ARCHITECTURE.md)
- **Integration Help**: See appropriate guide in `integration/`
- **General Support**: Refer to main [README.md](../README.md)

---

*This documentation is maintained as part of the GovBiz.ai project and follows semantic versioning along with the codebase.*
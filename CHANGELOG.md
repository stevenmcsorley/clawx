# Changelog

All notable changes to Clawx will be documented in this file.

## [0.3.9] - 2026-03-19

### Fixed
- **Windows Multi-Agent System**: Completely resolved `ECONNREFUSED` errors for dead agents
- **Agent Cleanup**: Enhanced `agent_cleanup` tool to properly remove stale agents and directories
- **Port Management**: Fixed port allocation conflicts and cleanup for Windows environments
- **Task Lifecycle**: Improved task execution and status reporting on Windows
- **Registry Consistency**: Ensured agent registry stays synchronized with actual running agents

### Added
- **Robust Agent Management**: Agents now properly clean up after themselves when killed
- **Health Monitoring**: Better detection and reporting of dead/unreachable agents
- **Cross-Platform Compatibility**: Windows-specific fixes for multi-agent operations

### Changed
- **Version Bump**: Updated from 0.3.8 to 0.3.9

### Technical Details
- Fixed issue where dead agents (John_Chat, Paul_Chat) remained in registry causing connection attempts
- Enhanced `agent_cleanup` to remove both registry entries and workspace directories
- Improved Windows process management for agent lifecycle
- Added proper error handling for agent connection failures
- Verified multi-agent system works correctly on Windows with master and worker agents

## [0.3.8] - Previous Release
- Initial multi-agent control plane implementation
- Basic agent spawning and task execution
- TUI integration for agent management
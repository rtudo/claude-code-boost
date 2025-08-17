#!/usr/bin/env node

import { Command } from 'commander';
import { autoApproveTools } from './commands/auto-approve-tools.js';
import { install } from './commands/install.js';
import { clearApprovalCache } from './commands/debug.js';
import { setProfile } from './commands/set-profile.js';

const program = new Command();

program
  .name('ccb')
  .description('Claude Code Boost - Hook utilities for Claude Code')
  .version('0.1.0');

program
  .command('auto-approve-tools')
  .description('Auto-approve specified tools in PreToolUse hook')
  .option('--use-claude-cli', 'Use Claude CLI instead of direct API calls')
  .action((options) => autoApproveTools(options.useClaudeCli));

program
  .command('install')
  .description('Install CCB auto-approve-tools hook to Claude Code settings')
  .option('--user', 'Install to user settings (~/.claude/settings.json)')
  .option('--project', 'Install to project settings (.claude/settings.json)')
  .option(
    '--project-local',
    'Install to project local settings (.claude/settings.local.json)'
  )
  .option('--api-key <key>', 'Set Anthropic API key (non-interactive)')
  .option(
    '--non-interactive',
    'Skip interactive prompts (for testing/automation)'
  )
  .action(install);

program
  .command('set-profile <profile>')
  .description('Set security profile (strict, default, or permissive)')
  .action((profile) => {
    if (!['strict', 'default', 'permissive'].includes(profile)) {
      console.error('Invalid profile. Choose: strict, default, or permissive');
      process.exit(1);
    }
    setProfile(profile as 'strict' | 'default' | 'permissive');
  });

const debugCommand = program
  .command('debug')
  .description('Debug utilities for CCB');

debugCommand
  .command('clear-approval-cache')
  .description('Clear the approval cache')
  .action(clearApprovalCache);

program.parse();

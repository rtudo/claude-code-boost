import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import type { HookOutput, ClaudeResponse } from '../types/hook-schemas.js';
import { parseHookInput, parseClaudeResponse } from '../types/hook-schemas.js';
import { logApproval } from '../logger.js';
import { loadConfig } from '../utils/config.js';
import { getCachedDecision, setCachedDecision } from '../utils/cache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadSystemPrompt(
  profile: 'strict' | 'default' | 'permissive' = 'default'
): string {
  const promptPath = join(__dirname, `../../prompts/profiles/${profile}.md`);
  try {
    return readFileSync(promptPath, 'utf8');
  } catch {
    // Fallback to default profile if specified profile doesn't exist
    // eslint-disable-next-line no-console
    console.warn(`Profile ${profile} not found, using default profile`);
    const defaultPath = join(__dirname, '../../prompts/profiles/default.md');
    return readFileSync(defaultPath, 'utf8');
  }
}

function loadUserPromptTemplate(): string {
  const promptPath = join(__dirname, '../../prompts/user-prompt.md');
  return readFileSync(promptPath, 'utf8');
}

function buildUserPrompt(
  toolName: string,
  toolInput: Record<string, unknown>
): string {
  const template = loadUserPromptTemplate();
  return template
    .replace('{{toolName}}', toolName)
    .replace('{{toolInput}}', JSON.stringify(toolInput, null, 2));
}

async function queryClaudeAPI(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<ClaudeResponse> {
  const config = loadConfig();
  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Anthropic API key is required. Set it in config.json or ANTHROPIC_API_KEY environment variable'
    );
  }

  const anthropic = new Anthropic({ apiKey });
  const systemPrompt = loadSystemPrompt(config.profile || 'default');
  const userPrompt = buildUserPrompt(toolName, toolInput);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude API');
    }

    let responseText = content.text.trim();

    // If the response is wrapped in markdown code blocks, extract the JSON
    if (responseText.includes('```json')) {
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        responseText = jsonMatch[1];
      }
    }

    const jsonData = JSON.parse(responseText);
    return parseClaudeResponse(jsonData);
  } catch {
    throw new Error(`Failed to query Claude API: ${error}`);
  }
}

async function queryClaudeCode(
  toolName: string,
  toolInput: Record<string, unknown>,
  profile: 'strict' | 'default' | 'permissive' = 'default'
): Promise<ClaudeResponse> {
  return new Promise((resolve, reject) => {
    const systemPrompt = loadSystemPrompt(profile);
    const userPrompt = buildUserPrompt(toolName, toolInput);
    const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;

    const claude = spawn('claude', ['-p', '--output-format', 'json'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    claude.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    claude.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    claude.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const claudeOutput = JSON.parse(stdout.trim());

        // Extract the actual response from Claude's wrapped format
        let actualResponse = claudeOutput.result;

        // If the response is wrapped in markdown code blocks, extract the JSON
        if (actualResponse.includes('```json')) {
          const jsonMatch = actualResponse.match(/```json\n([\s\S]*?)\n```/);
          if (jsonMatch) {
            actualResponse = jsonMatch[1];
          }
        }

        const jsonData = JSON.parse(actualResponse);
        const response = parseClaudeResponse(jsonData);
        resolve(response);
      } catch (parseError) {
        reject(new Error(`Failed to parse Claude response: ${parseError}`));
      }
    });

    claude.stdin.write(combinedPrompt);
    claude.stdin.end();
  });
}

// Tools that are unambiguously safe and should be auto-approved without AI query
const FAST_APPROVE_TOOLS = new Set([
  'Read',
  'LS',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'NotebookRead',
  'TodoWrite',
  'Task',
]);

// Tools that are safe for writing/editing in development contexts
// NOTE: These are commented out to require AI approval for all write operations
// Uncomment the lines below to re-enable fast approval for write operations
// const SAFE_WRITE_TOOLS = new Set([
//   'Write',
//   'Edit',
//   'MultiEdit',
//   'NotebookEdit',
// ]);

function hasApiKeyConfigured(): boolean {
  const config = loadConfig();
  return !!(config.apiKey || process.env.ANTHROPIC_API_KEY);
}

function shouldFastApprove(
  toolName: string,
  _toolInput: Record<string, unknown>,
  profile: 'strict' | 'default' | 'permissive' = 'default'
): HookOutput | null {
  // In strict mode, only fast-approve read-only tools
  if (profile === 'strict') {
    if (FAST_APPROVE_TOOLS.has(toolName)) {
      return {
        decision: 'approve',
        reason: `${toolName} is a safe read-only operation`,
      };
    }
    return null; // Everything else needs AI review in strict mode
  }

  // In permissive mode, fast-approve both read and write tools
  if (profile === 'permissive') {
    if (FAST_APPROVE_TOOLS.has(toolName)) {
      return {
        decision: 'approve',
        reason: `${toolName} is a safe read-only operation`,
      };
    }
    // Re-enable the SAFE_WRITE_TOOLS for permissive mode
    const SAFE_WRITE_TOOLS = new Set([
      'Write',
      'Edit',
      'MultiEdit',
      'NotebookEdit',
    ]);
    if (SAFE_WRITE_TOOLS.has(toolName)) {
      return {
        decision: 'approve',
        reason: `${toolName} is a safe development operation`,
      };
    }
  }

  // Default mode: approve read-only, but not write operations
  if (FAST_APPROVE_TOOLS.has(toolName)) {
    return {
      decision: 'approve',
      reason: `${toolName} is a safe read-only operation`,
    };
  }

  return null; // No fast approval, use AI query
}

export async function autoApproveTools(
  useClaudeCli?: boolean,
  _profileOverride?: string
): Promise<void> {
  try {
    const input = readFileSync(0, 'utf8');
    const jsonData = JSON.parse(input);
    const hookData = parseHookInput(jsonData);
    const workingDir = process.cwd();
    const config = loadConfig();

    let output: HookOutput;

    // Check for fast approval first
    const fastApproval = shouldFastApprove(
      hookData.tool_name,
      hookData.tool_input,
      config.profile || 'default'
    );
    if (fastApproval) {
      output = fastApproval;
    } else {
      // Check cache for previous decision (only if cache is enabled)
      let cachedDecision = null;
      if (config.cache) {
        cachedDecision = getCachedDecision(
          hookData.tool_name,
          hookData.tool_input,
          workingDir
        );
      }

      if (cachedDecision) {
        output = {
          decision: cachedDecision.decision,
          reason: `${cachedDecision.reason} (cached)`,
        };
      } else {
        // Determine whether to use Claude CLI or API
        const shouldUseClaudeCli =
          useClaudeCli !== undefined ? useClaudeCli : !hasApiKeyConfigured();

        // Fall back to AI-powered decision making
        const claudeResponse = shouldUseClaudeCli
          ? await queryClaudeCode(
              hookData.tool_name,
              hookData.tool_input,
              config.profile || 'default'
            )
          : await queryClaudeAPI(hookData.tool_name, hookData.tool_input);

        output = {
          decision:
            claudeResponse.decision === 'unsure'
              ? undefined
              : claudeResponse.decision,
          reason: claudeResponse.reason,
        };

        // Cache the decision if it's approve or block (not unsure) and cache is enabled
        if (config.cache && claudeResponse.decision !== 'unsure') {
          setCachedDecision(
            hookData.tool_name,
            hookData.tool_input,
            workingDir,
            claudeResponse.decision,
            claudeResponse.reason
          );
        }
      }
    }

    // Log the approval decision if enabled in config
    if (config.log) {
      await logApproval(
        hookData.tool_name,
        hookData.tool_input,
        output.decision || 'undefined',
        output.reason,
        hookData.session_id
      );
    }

    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  } catch {
    process.stderr.write(`Error processing hook input: ${error}\n`);
    process.exit(1);
  }
}

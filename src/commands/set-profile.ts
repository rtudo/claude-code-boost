import { loadConfig, saveConfig } from '../utils/config.js';

export function setProfile(profile: 'strict' | 'default' | 'permissive'): void {
  try {
    const config = loadConfig();
    config.profile = profile;
    saveConfig(config);

    // eslint-disable-next-line no-console
    console.log(`✅ Security profile set to: ${profile}`);

    // Explain what each profile does
    switch (profile) {
      case 'strict':
        // eslint-disable-next-line no-console
        console.log(
          '📝 Strict mode: Requires confirmation for ALL write operations'
        );
        // eslint-disable-next-line no-console
        console.log('   - Only read operations are auto-approved');
        // eslint-disable-next-line no-console
        console.log('   - Maximum security for assisted development');
        break;
      case 'default':
        // eslint-disable-next-line no-console
        console.log('⚖️  Default mode: Balanced security');
        // eslint-disable-next-line no-console
        console.log('   - Read operations are auto-approved');
        // eslint-disable-next-line no-console
        console.log('   - Write operations require confirmation');
        // eslint-disable-next-line no-console
        console.log('   - File deletions in project context are approved');
        break;
      case 'permissive':
        // eslint-disable-next-line no-console
        console.log('🚀 Permissive mode: Maximum productivity');
        // eslint-disable-next-line no-console
        console.log('   - All development operations are auto-approved');
        // eslint-disable-next-line no-console
        console.log('   - Only blocks system-destructive commands');
        // eslint-disable-next-line no-console
        console.log('   - Best for experienced developers');
        break;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Error setting profile: ${error}`);
    process.exit(1);
  }
}

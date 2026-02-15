#!/usr/bin/env node

import chalk from 'chalk';
import notifier from 'node-notifier';
import { getConfig } from './commands/init.js';
import { initDb, all, get } from './utils/database.js';

/**
 * Real-time monitoring for environment variables
 */
class EnvMonitor {
  constructor() {
    this.isRunning = false;
    this.checks = [];
    this.alerts = [];
  }

  /**
   * Start the monitor
   */
  start() {
    console.log(chalk.cyan('🔍 Starting EnvGuard Monitor...'));
    
    const config = getConfig();
    if (!config) {
      console.log(chalk.red('✗ Not initialized'));
      process.exit(1);
    }

    this.isRunning = true;
    
    // Check for secrets needing rotation
    setInterval(() => {
      this.checkRotation();
    }, 60000); // Every minute
    
    // Check for unused variables
    setInterval(() => {
      this.checkUnusedVariables();
    }, 3600000); // Every hour
    
    // Check for duplicate values
    setInterval(() => {
      this.checkDuplicates();
    }, 3600000); // Every hour

    console.log(chalk.green('✓ Monitor started'));
    console.log(chalk.gray('  - Checking rotation status every minute'));
    console.log(chalk.gray('  - Checking unused variables every hour'));
    console.log(chalk.gray('  - Checking for duplicates every hour'));
    
    this.displayStatus();
  }

  /**
   * Check for secrets needing rotation
   */
  async checkRotation() {
    if (!this.isRunning) return;
    
    try {
      await initDb();
      
      const secrets = all(`
        SELECT v.*, e.name as env_name
        FROM variables v
        JOIN environments e ON v.environment_id = e.id
        WHERE v.is_secret = 1 
        AND v.rotation_enabled = 1 
        AND v.next_rotation IS NOT NULL
        AND v.next_rotation <= datetime('now')
      `);
      
      if (secrets.length > 0) {
        const message = `⚠️ ${secrets.length} secrets need rotation`;
        console.log(chalk.yellow(message));
        
        secrets.forEach(s => {
          console.log(chalk.gray(`  - ${s.env_name}/${s.key}`));
        });
        
        this.sendNotification('Rotation Required', message);
      }
    } catch (error) {
      console.error(chalk.red('Error checking rotation:'), error.message);
    }
  }

  /**
   * Check for unused variables
   */
  async checkUnusedVariables() {
    if (!this.isRunning) return;
    
    try {
      await initDb();
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const unused = all(`
        SELECT v.*, e.name as env_name
        FROM variables v
        JOIN environments e ON v.environment_id = e.id
        WHERE v.updated_at < ?
      `, [thirtyDaysAgo.toISOString()]);
      
      if (unused.length > 0) {
        const message = `📊 ${unused.length} variables unused for 30+ days`;
        console.log(chalk.blue(message));
        
        unused.slice(0, 10).forEach(v => {
          console.log(chalk.gray(`  - ${v.env_name}/${v.key}`));
        });
      }
    } catch (error) {
      console.error(chalk.red('Error checking unused:'), error.message);
    }
  }

  /**
   * Check for duplicate values
   */
  async checkDuplicates() {
    if (!this.isRunning) return;
    
    try {
      await initDb();
      
      const duplicates = all(`
        SELECT value, COUNT(*) as count, GROUP_CONCAT(key) as keys
        FROM variables
        WHERE value IS NOT NULL AND value != ''
        GROUP BY value
        HAVING COUNT(*) > 1
      `);
      
      if (duplicates.length > 0) {
        const message = `🔴 ${duplicates.length} duplicate values found`;
        console.log(chalk.red(message));
        
        duplicates.slice(0, 5).forEach(d => {
          console.log(chalk.gray(`  - ${d.keys} (${d.count} times)`));
        });
      }
    } catch (error) {
      console.error(chalk.red('Error checking duplicates:'), error.message);
    }
  }

  /**
   * Display current status
   */
  async displayStatus() {
    try {
      await initDb();
      
      const totalVars = get('SELECT COUNT(*) as count FROM variables');
      const totalSecrets = get('SELECT COUNT(*) as count FROM variables WHERE is_secret = 1');
      const secretsNeedRotation = get(`
        SELECT COUNT(*) as count FROM variables 
        WHERE is_secret = 1 AND rotation_enabled = 1 
        AND next_rotation IS NOT NULL AND next_rotation <= datetime('now')
      `);
      
      console.log(chalk.cyan('\n📊 Current Status:'));
      console.log(chalk.gray(`  Total Variables: ${totalVars?.count || 0}`));
      console.log(chalk.gray(`  Secrets: ${totalSecrets?.count || 0}`));
      console.log(chalk.gray(`  Need Rotation: ${secretsNeedRotation?.count || 0}`));
      console.log();
    } catch (error) {
      // Ignore
    }
  }

  /**
   * Send notification
   */
  sendNotification(title, message) {
    notifier.notify({
      title: 'EnvGuard Monitor',
      message: message,
      sound: true,
      wait: false
    });
  }

  /**
   * Stop the monitor
   */
  stop() {
    this.isRunning = false;
    console.log(chalk.yellow('Monitor stopped'));
  }
}

// Run monitor
const monitor = new EnvMonitor();
monitor.start();

// Handle graceful shutdown
process.on('SIGINT', () => {
  monitor.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  monitor.stop();
  process.exit(0);
});

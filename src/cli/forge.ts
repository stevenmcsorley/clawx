// Forge v1 CLI commands

import { Command } from 'commander';
import { discoverOpportunities, listOpportunities, findOpportunity } from '../forge/discover.js';
import { createScaffoldPlan, executeScaffoldPlan } from '../forge/scaffold.js';
import type { ClawxConfig } from '../types/index.js';

export function createForgeCommand(config: ClawxConfig): Command {
  const program = new Command('forge')
    .description('Discover and scaffold capabilities from Hugging Face ecosystem')
    .configureHelp({ sortSubcommands: true });

  // forge discover <query>
  program
    .command('discover')
    .description('Search HF Hub for models and datasets')
    .argument('<query>', 'Search query (e.g., "medical text classification")')
    .option('-l, --limit <number>', 'Maximum results (default: 20)', '20')
    .action(async (query, options) => {
      try {
        const limit = parseInt(options.limit, 10);
        if (isNaN(limit) || limit < 1 || limit > 100) {
          console.error('❌ Limit must be between 1 and 100');
          process.exit(1);
        }

        console.log(`🔍 Forge v1: Discovering opportunities for "${query}"`);
        console.log('='.repeat(60));

        const opportunities = await discoverOpportunities({
          query,
          limit
        });

        if (opportunities.length === 0) {
          console.log('❌ No opportunities found. Try a different query.');
          process.exit(1);
        }

        console.log(`✅ Found ${opportunities.length} opportunities`);
        console.log('\nTop opportunities:');
        console.log('='.repeat(60));

        opportunities.slice(0, 10).forEach((opp, index) => {
          const score = Math.round(opp.scores.overall * 100);
          console.log(`${index + 1}. ${opp.id} - ${opp.title}`);
          console.log(`   ${opp.description}`);
          console.log(`   📊 Scores: U${Math.round(opp.scores.usefulness * 100)} N${Math.round(opp.scores.novelty * 100)} F${Math.round(opp.scores.feasibility * 100)} C${Math.round(opp.scores.fit * 100)} (Overall: ${score}%)`);
          console.log(`   🏗️  Can be: ${opp.possibleOutputs.map(o => `${o.type} (${o.complexity})`).join(', ')}`);
          console.log();
        });

        if (opportunities.length > 10) {
          console.log(`... and ${opportunities.length - 10} more`);
        }

        console.log('='.repeat(60));
        console.log('Next:');
        console.log(`  clawx forge list                    # List all discovered opportunities`);
        console.log(`  clawx forge info <id>              # Show details for an opportunity`);
        console.log(`  clawx forge scaffold <id> --type tool --name my-tool`);
        console.log(`  clawx forge scaffold <id> --type app --name my-app`);

      } catch (error) {
        console.error('❌ Discovery failed:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // forge list
  program
    .command('list')
    .description('List discovered opportunities')
    .option('-s, --sort <field>', 'Sort by: overall, usefulness, novelty, feasibility, fit', 'overall')
    .option('--min-score <number>', 'Minimum overall score (0-1)', '0.0')
    .option('--limit <number>', 'Maximum results to show', '20')
    .action((options) => {
      try {
        const minScore = parseFloat(options.minScore);
        const limit = parseInt(options.limit, 10);
        
        if (isNaN(minScore) || minScore < 0 || minScore > 1) {
          console.error('❌ min-score must be between 0 and 1');
          process.exit(1);
        }

        const opportunities = listOpportunities({
          sort: options.sort as any,
          minScore,
          limit
        });

        if (opportunities.length === 0) {
          console.log('📭 No opportunities found. Run "clawx forge discover <query>" first.');
          process.exit(0);
        }

        console.log(`📋 Found ${opportunities.length} opportunities`);
        console.log('='.repeat(80));

        opportunities.forEach((opp, index) => {
          const score = Math.round(opp.scores.overall * 100);
          const date = new Date(opp.createdAt).toLocaleDateString();
          
          console.log(`${index + 1}. ${opp.id}`);
          console.log(`   ${opp.title}`);
          console.log(`   ${opp.description}`);
          console.log(`   📊 U${Math.round(opp.scores.usefulness * 100)} N${Math.round(opp.scores.novelty * 100)} F${Math.round(opp.scores.feasibility * 100)} C${Math.round(opp.scores.fit * 100)} (Overall: ${score}%)`);
          console.log(`   🏗️  ${opp.possibleOutputs.map(o => `${o.type} (${o.complexity})`).join(', ')}`);
          console.log(`   📅 ${date} | 🔍 "${opp.query}"`);
          console.log();
        });

      } catch (error) {
        console.error('❌ Failed to list opportunities:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // forge info <id>
  program
    .command('info')
    .description('Show details for an opportunity')
    .argument('<id>', 'Opportunity ID (e.g., opp_abc123)')
    .option('--json', 'Output as JSON', false)
    .action((id, options) => {
      try {
        const opportunity = findOpportunity(id);
        
        if (!opportunity) {
          console.error(`❌ Opportunity ${id} not found. Run "clawx forge list" to see available opportunities.`);
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify(opportunity, null, 2));
          return;
        }

        console.log(`📄 Opportunity: ${opportunity.id}`);
        console.log('='.repeat(60));
        console.log(`Title: ${opportunity.title}`);
        console.log(`Description: ${opportunity.description}`);
        console.log(`Discovered: ${new Date(opportunity.createdAt).toLocaleString()}`);
        console.log(`Query: "${opportunity.query}"`);
        
        console.log('\n📊 Scores:');
        console.log(`  Usefulness: ${Math.round(opportunity.scores.usefulness * 100)}%`);
        console.log(`  Novelty: ${Math.round(opportunity.scores.novelty * 100)}%`);
        console.log(`  Feasibility: ${Math.round(opportunity.scores.feasibility * 100)}% (how well it can run locally)`);
        console.log(`  Clawx Fit: ${Math.round(opportunity.scores.fit * 100)}% (how well it fits with Clawx)`);
        console.log(`  Overall: ${Math.round(opportunity.scores.overall * 100)}%`);
        
        console.log('\n🤖 Primary Model:');
        console.log(`  ID: ${opportunity.primaryModel.id}`);
        console.log(`  Name: ${opportunity.primaryModel.name}`);
        console.log(`  Author: ${opportunity.primaryModel.author}`);
        console.log(`  Downloads: ${opportunity.primaryModel.downloads.toLocaleString()}`);
        console.log(`  Task: ${opportunity.primaryModel.task || 'N/A'}`);
        console.log(`  Modality: ${opportunity.primaryModel.modality || 'N/A'}`);
        console.log(`  License: ${opportunity.primaryModel.license || 'N/A'}`);
        console.log(`  Hardware: ${opportunity.primaryModel.hardware?.gpu ? 'GPU' : 'CPU'}, ${opportunity.primaryModel.hardware?.memory || 'unknown'} memory`);
        console.log(`  Tags: ${opportunity.primaryModel.tags.slice(0, 5).join(', ')}${opportunity.primaryModel.tags.length > 5 ? '...' : ''}`);
        
        if (opportunity.supportingDataset) {
          console.log('\n📚 Supporting Dataset:');
          console.log(`  ID: ${opportunity.supportingDataset.id}`);
          console.log(`  Name: ${opportunity.supportingDataset.name}`);
          console.log(`  Author: ${opportunity.supportingDataset.author}`);
          console.log(`  Downloads: ${opportunity.supportingDataset.downloads.toLocaleString()}`);
          console.log(`  Task: ${opportunity.supportingDataset.task || 'N/A'}`);
          console.log(`  Tags: ${opportunity.supportingDataset.tags.slice(0, 5).join(', ')}`);
        }
        
        console.log('\n🏗️  Possible Outputs:');
        opportunity.possibleOutputs.forEach(output => {
          console.log(`  • ${output.type} (${output.complexity} complexity)`);
        });
        
        console.log('\n🚀 Scaffold this opportunity:');
        console.log(`  clawx forge scaffold ${opportunity.id} --type tool --name my-tool`);
        console.log(`  clawx forge scaffold ${opportunity.id} --type app --name my-app`);
        
      } catch (error) {
        console.error('❌ Failed to show opportunity info:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // forge scaffold <id>
  program
    .command('scaffold')
    .description('Scaffold an opportunity into a tool or app')
    .argument('<id>', 'Opportunity ID (e.g., opp_abc123)')
    .requiredOption('-t, --type <type>', 'Output type: tool or app')
    .requiredOption('-n, --name <name>', 'Name for the generated tool/app')
    .option('-o, --output-dir <path>', 'Output directory (default: ./<name>)')
    .action(async (id, options) => {
      try {
        const opportunity = findOpportunity(id);
        
        if (!opportunity) {
          console.error(`❌ Opportunity ${id} not found. Run "clawx forge list" to see available opportunities.`);
          process.exit(1);
        }

        if (options.type !== 'tool' && options.type !== 'app') {
          console.error('❌ Type must be "tool" or "app"');
          process.exit(1);
        }

        const outputDir = options.outputDir || `./${options.name}`;
        
        console.log(`🏗️  Forge v1: Scaffolding ${options.type} from ${id}`);
        console.log('='.repeat(60));
        console.log(`Opportunity: ${opportunity.title}`);
        console.log(`Output: ${options.name} (${options.type})`);
        console.log(`Directory: ${outputDir}`);
        console.log();

        // Create scaffold plan
        const plan = createScaffoldPlan(opportunity, {
          opportunityId: id,
          outputType: options.type,
          outputName: options.name,
          outputDir
        });

        // Execute scaffold plan
        executeScaffoldPlan(plan, outputDir);

      } catch (error) {
        console.error('❌ Scaffolding failed:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  return program;
}
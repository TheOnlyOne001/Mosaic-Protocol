/**
 * Free Dataset Downloader
 * 
 * Downloads and parses free smart contract datasets from:
 * - GitHub repositories
 * - HuggingFace datasets
 * - Kaggle datasets
 * 
 * No API costs - uses public downloads only.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  LabeledContract,
  FreeDatasetConfig,
  FREE_DATASETS,
  PrimaryLabel,
  createEmptyContract,
} from './schema.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DownloadResult {
  dataset: string;
  success: boolean;
  contractCount: number;
  contracts: LabeledContract[];
  error?: string;
  downloadTime: number;
}

export interface DatasetStats {
  totalDownloaded: number;
  bySource: Record<string, number>;
  byLabel: Record<PrimaryLabel, number>;
  errors: string[];
}

// ============================================================================
// FREE DATASET DOWNLOADER
// ============================================================================

export class FreeDatasetDownloader {
  private dataDir: string;
  private cacheDir: string;
  
  constructor(dataDir: string = './data/datasets') {
    this.dataDir = dataDir;
    this.cacheDir = path.join(dataDir, '.cache');
    
    // Ensure directories exist
    this.ensureDir(this.dataDir);
    this.ensureDir(this.cacheDir);
    this.ensureDir(path.join(this.dataDir, 'github'));
    this.ensureDir(path.join(this.dataDir, 'huggingface'));
    this.ensureDir(path.join(this.dataDir, 'kaggle'));
  }
  
  /**
   * Download all configured free datasets
   */
  async downloadAll(): Promise<DatasetStats> {
    console.log('\n[FreeDatasetDownloader] Starting download of all free datasets...\n');
    
    const stats: DatasetStats = {
      totalDownloaded: 0,
      bySource: {},
      byLabel: {
        honeypot: 0,
        rugpull: 0,
        exploit: 0,
        safe: 0,
        risky: 0,
        unknown: 0,
      },
      errors: [],
    };
    
    for (const config of FREE_DATASETS) {
      console.log(`\n[Download] ${config.name} from ${config.source}...`);
      
      try {
        const result = await this.downloadDataset(config);
        
        if (result.success) {
          stats.totalDownloaded += result.contractCount;
          stats.bySource[config.source] = (stats.bySource[config.source] || 0) + result.contractCount;
          
          // Count labels
          for (const contract of result.contracts) {
            stats.byLabel[contract.primaryLabel]++;
          }
          
          console.log(`  ✓ Downloaded ${result.contractCount} contracts in ${result.downloadTime}ms`);
        } else {
          stats.errors.push(`${config.name}: ${result.error}`);
          console.log(`  ✗ Failed: ${result.error}`);
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        stats.errors.push(`${config.name}: ${errMsg}`);
        console.log(`  ✗ Error: ${errMsg}`);
      }
    }
    
    console.log('\n[FreeDatasetDownloader] Download complete!');
    console.log(`  Total contracts: ${stats.totalDownloaded}`);
    console.log(`  By source: ${JSON.stringify(stats.bySource)}`);
    console.log(`  By label: ${JSON.stringify(stats.byLabel)}`);
    if (stats.errors.length > 0) {
      console.log(`  Errors: ${stats.errors.length}`);
    }
    
    return stats;
  }
  
  /**
   * Download a specific dataset
   */
  async downloadDataset(config: FreeDatasetConfig): Promise<DownloadResult> {
    const startTime = Date.now();
    
    try {
      let contracts: LabeledContract[] = [];
      
      switch (config.source) {
        case 'github':
          contracts = await this.downloadGitHub(config);
          break;
        case 'huggingface':
          contracts = await this.downloadHuggingFace(config);
          break;
        case 'kaggle':
          contracts = await this.downloadKaggle(config);
          break;
        case 'url':
          contracts = await this.downloadUrl(config);
          break;
        default:
          throw new Error(`Unknown source: ${config.source}`);
      }
      
      return {
        dataset: config.name,
        success: true,
        contractCount: contracts.length,
        contracts,
        downloadTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        dataset: config.name,
        success: false,
        contractCount: 0,
        contracts: [],
        error: error instanceof Error ? error.message : String(error),
        downloadTime: Date.now() - startTime,
      };
    }
  }
  
  /**
   * Download from GitHub repository
   */
  private async downloadGitHub(config: FreeDatasetConfig): Promise<LabeledContract[]> {
    const repoName = config.url.split('/').pop() || 'repo';
    const targetDir = path.join(this.dataDir, 'github', repoName);
    
    // Clone or pull
    if (fs.existsSync(targetDir)) {
      console.log(`  Updating existing repo...`);
      try {
        execSync('git pull', { cwd: targetDir, stdio: 'pipe' });
      } catch {
        // Ignore pull errors, use existing
      }
    } else {
      console.log(`  Cloning repository...`);
      execSync(`git clone --depth 1 ${config.url} ${targetDir}`, { stdio: 'pipe' });
    }
    
    // Parse contracts based on format
    return this.parseLocalDataset(targetDir, config);
  }
  
  /**
   * Download from HuggingFace
   */
  private async downloadHuggingFace(config: FreeDatasetConfig): Promise<LabeledContract[]> {
    const datasetName = config.url.replace('/', '_');
    const targetDir = path.join(this.dataDir, 'huggingface', datasetName);
    this.ensureDir(targetDir);
    
    // Construct download URL for data files
    const baseUrl = `https://huggingface.co/datasets/${config.url}/resolve/main`;
    
    // Try common file paths
    const possibleFiles = [
      'data/train.parquet',
      'data/train-00000-of-00001.parquet',
      'train.parquet',
      'data.jsonl',
      'train.jsonl',
      'data/train.jsonl',
    ];
    
    let downloaded = false;
    let localFile = '';
    
    for (const file of possibleFiles) {
      const url = `${baseUrl}/${file}`;
      const ext = file.split('.').pop() || '';
      localFile = path.join(targetDir, `data.${ext}`);
      
      try {
        console.log(`  Trying ${file}...`);
        const response = await fetch(url);
        
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          fs.writeFileSync(localFile, Buffer.from(buffer));
          downloaded = true;
          console.log(`  Downloaded ${file}`);
          break;
        }
      } catch {
        // Try next file
      }
    }
    
    if (!downloaded) {
      throw new Error('Could not find data files in HuggingFace dataset');
    }
    
    // Parse the downloaded file
    return this.parseFile(localFile, config);
  }
  
  /**
   * Download from Kaggle
   */
  private async downloadKaggle(config: FreeDatasetConfig): Promise<LabeledContract[]> {
    const datasetName = config.url.replace('/', '_');
    const targetDir = path.join(this.dataDir, 'kaggle', datasetName);
    this.ensureDir(targetDir);
    
    // Check if already downloaded
    const files = fs.existsSync(targetDir) ? fs.readdirSync(targetDir) : [];
    
    if (files.length === 0) {
      // Try to download via Kaggle CLI
      try {
        console.log(`  Downloading via Kaggle CLI...`);
        execSync(`kaggle datasets download -d ${config.url} -p ${targetDir} --unzip`, { 
          stdio: 'pipe',
          timeout: 300000, // 5 min timeout
        });
      } catch (error) {
        // Kaggle CLI might not be installed, provide instructions
        throw new Error(
          `Kaggle download failed. Please:\n` +
          `1. Install Kaggle CLI: pip install kaggle\n` +
          `2. Set up API token: https://www.kaggle.com/docs/api\n` +
          `3. Run: kaggle datasets download -d ${config.url} -p ${targetDir} --unzip`
        );
      }
    }
    
    // Parse downloaded files
    return this.parseLocalDataset(targetDir, config);
  }
  
  /**
   * Download from direct URL
   */
  private async downloadUrl(config: FreeDatasetConfig): Promise<LabeledContract[]> {
    const fileName = config.url.split('/').pop() || 'data';
    const localFile = path.join(this.cacheDir, fileName);
    
    // Download if not cached
    if (!fs.existsSync(localFile)) {
      console.log(`  Downloading from URL...`);
      const response = await fetch(config.url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(localFile, Buffer.from(buffer));
    }
    
    return this.parseFile(localFile, config);
  }
  
  /**
   * Parse a local dataset directory
   */
  private parseLocalDataset(dir: string, config: FreeDatasetConfig): LabeledContract[] {
    const contracts: LabeledContract[] = [];
    
    // Find data files
    const files = this.findDataFiles(dir, config.format);
    
    for (const file of files) {
      try {
        const fileContracts = this.parseFile(file, config);
        contracts.push(...fileContracts);
      } catch (error) {
        console.warn(`  Warning: Could not parse ${file}`);
      }
    }
    
    return contracts;
  }
  
  /**
   * Find data files in directory
   */
  private findDataFiles(dir: string, format: string): string[] {
    const files: string[] = [];
    
    const walk = (currentDir: string) => {
      const items = fs.readdirSync(currentDir);
      
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Skip hidden and common non-data directories
          if (!item.startsWith('.') && !['node_modules', '__pycache__'].includes(item)) {
            walk(fullPath);
          }
        } else {
          // Check if file matches format
          const ext = item.split('.').pop()?.toLowerCase();
          if (this.matchesFormat(ext, format)) {
            files.push(fullPath);
          }
        }
      }
    };
    
    walk(dir);
    return files;
  }
  
  /**
   * Check if file extension matches expected format
   */
  private matchesFormat(ext: string | undefined, format: string): boolean {
    if (!ext) return false;
    
    const formatMap: Record<string, string[]> = {
      'json': ['json'],
      'jsonl': ['jsonl', 'ndjson'],
      'csv': ['csv'],
      'parquet': ['parquet'],
      'solidity': ['sol'],
    };
    
    return formatMap[format]?.includes(ext) || false;
  }
  
  /**
   * Parse a single file into contracts
   */
  private parseFile(filePath: string, config: FreeDatasetConfig): LabeledContract[] {
    const ext = filePath.split('.').pop()?.toLowerCase();
    
    switch (ext) {
      case 'json':
        return this.parseJson(filePath, config);
      case 'jsonl':
      case 'ndjson':
        return this.parseJsonl(filePath, config);
      case 'csv':
        return this.parseCsv(filePath, config);
      case 'parquet':
        return this.parseParquet(filePath, config);
      case 'sol':
        return this.parseSolidity(filePath, config);
      default:
        return [];
    }
  }
  
  /**
   * Parse JSON file
   */
  private parseJson(filePath: string, config: FreeDatasetConfig): LabeledContract[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    // Handle array or object with array
    const items = Array.isArray(data) ? data : (data.contracts || data.data || []);
    
    return items.map((item: any) => this.itemToContract(item, config)).filter(Boolean);
  }
  
  /**
   * Parse JSONL file
   */
  private parseJsonl(filePath: string, config: FreeDatasetConfig): LabeledContract[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    return lines.map(line => {
      try {
        const item = JSON.parse(line);
        return this.itemToContract(item, config);
      } catch {
        return null;
      }
    }).filter(Boolean) as LabeledContract[];
  }
  
  /**
   * Parse CSV file
   */
  private parseCsv(filePath: string, config: FreeDatasetConfig): LabeledContract[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    if (lines.length < 2) return [];
    
    // Parse header
    const header = this.parseCsvLine(lines[0]);
    
    // Parse rows
    return lines.slice(1).map(line => {
      if (!line.trim()) return null;
      
      const values = this.parseCsvLine(line);
      const item: Record<string, string> = {};
      
      header.forEach((col, i) => {
        item[col] = values[i] || '';
      });
      
      return this.itemToContract(item, config);
    }).filter(Boolean) as LabeledContract[];
  }
  
  /**
   * Parse CSV line handling quotes
   */
  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    return values;
  }
  
  /**
   * Parse Parquet file (simplified - would need parquetjs in production)
   */
  private parseParquet(filePath: string, config: FreeDatasetConfig): LabeledContract[] {
    // For now, return empty and log instruction
    console.log(`  Note: Parquet parsing requires parquetjs-lite. Install with: npm install parquetjs-lite`);
    console.log(`  File saved at: ${filePath}`);
    
    // In production, would use:
    // const parquet = require('parquetjs-lite');
    // const reader = await parquet.ParquetReader.openFile(filePath);
    // ...
    
    return [];
  }
  
  /**
   * Parse Solidity file
   */
  private parseSolidity(filePath: string, config: FreeDatasetConfig): LabeledContract[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath, '.sol');
    
    // Extract label from directory structure or filename
    const pathParts = filePath.split(path.sep);
    let label: PrimaryLabel = 'unknown';
    
    // Look for vulnerability type in path
    for (const part of pathParts) {
      const normalized = part.toLowerCase();
      if (config.labelMapping && config.labelMapping[normalized]) {
        label = config.labelMapping[normalized];
        break;
      }
      // Common vulnerability folder names
      if (normalized.includes('reentrancy')) label = 'exploit';
      if (normalized.includes('overflow')) label = 'exploit';
      if (normalized.includes('access')) label = 'exploit';
      if (normalized.includes('safe') || normalized.includes('fixed')) label = 'safe';
    }
    
    const contract = createEmptyContract('ethereum', `solidity:${fileName}`);
    contract.primaryLabel = label;
    contract.sourceCode = content;
    contract.labelSources.push(config.source === 'github' ? 'dataset_github' : 'dataset_hf');
    contract.labelConfidence = 0.7;
    contract.confidenceLevel = 'medium';
    
    return [contract];
  }
  
  /**
   * Convert raw item to LabeledContract
   */
  private itemToContract(item: any, config: FreeDatasetConfig): LabeledContract | null {
    if (!item) return null;
    
    // Extract address
    let address = '';
    if (config.addressField && item[config.addressField]) {
      address = item[config.addressField];
    } else if (item.address) {
      address = item.address;
    } else if (item.contract_address) {
      address = item.contract_address;
    } else {
      // Generate unique ID for code-only entries
      address = `code:${Math.random().toString(36).substring(7)}`;
    }
    
    // Extract chain
    let chain = 'ethereum';
    if (config.chainField && item[config.chainField]) {
      chain = item[config.chainField];
    } else if (item.chain) {
      chain = item.chain;
    }
    
    // Extract label
    let rawLabel = 'unknown';
    if (config.labelField && item[config.labelField] !== undefined) {
      rawLabel = String(item[config.labelField]);
    } else if (item.label !== undefined) {
      rawLabel = String(item.label);
    } else if (item.vulnerable !== undefined) {
      rawLabel = item.vulnerable === '1' || item.vulnerable === 1 || item.vulnerable === true ? 'exploit' : 'safe';
    }
    
    // Map label
    let label: PrimaryLabel = 'unknown';
    if (config.labelMapping && config.labelMapping[rawLabel]) {
      label = config.labelMapping[rawLabel];
    } else if (['honeypot', 'rugpull', 'exploit', 'safe', 'risky'].includes(rawLabel)) {
      label = rawLabel as PrimaryLabel;
    }
    
    // Create contract
    const contract = createEmptyContract(chain, address);
    contract.primaryLabel = label;
    contract.labelConfidence = 0.65;
    contract.confidenceLevel = 'medium';
    
    // Add source code if available
    if (config.codeField && item[config.codeField]) {
      contract.sourceCode = item[config.codeField];
    } else if (item.source_code) {
      contract.sourceCode = item.source_code;
    } else if (item.code) {
      contract.sourceCode = item.code;
    }
    
    // Set source
    const source = config.source === 'github' ? 'dataset_github' : 
                   config.source === 'huggingface' ? 'dataset_hf' : 
                   config.source === 'kaggle' ? 'dataset_kaggle' : 'dataset_github';
    contract.labelSources.push(source);
    
    // Add vote
    contract.sourceVotes.push({
      source,
      label,
      confidence: 0.65,
      timestamp: Date.now(),
      rawData: item,
    });
    
    return contract;
  }
  
  /**
   * Ensure directory exists
   */
  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  
  /**
   * Get download statistics
   */
  getStats(): { cached: number; bySource: Record<string, number> } {
    const stats = { cached: 0, bySource: {} as Record<string, number> };
    
    for (const source of ['github', 'huggingface', 'kaggle']) {
      const dir = path.join(this.dataDir, source);
      if (fs.existsSync(dir)) {
        const items = fs.readdirSync(dir);
        stats.bySource[source] = items.length;
        stats.cached += items.length;
      }
    }
    
    return stats;
  }
}

// Singleton
let downloader: FreeDatasetDownloader | null = null;

export function getFreeDatasetDownloader(dataDir?: string): FreeDatasetDownloader {
  if (!downloader) {
    downloader = new FreeDatasetDownloader(dataDir);
  }
  return downloader;
}

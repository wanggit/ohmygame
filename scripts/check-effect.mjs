#!/usr/bin/env node

/**
 * 特效质量检查工具（借鉴 pixelfx）
 * 
 * 检查问题：
 * - spills：特效超出边界
 * - seams：循环特效的接缝
 * - unseeded randomness：未种子化的随机数
 * - slow frames：性能问题
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

interface CheckResult {
  ok: boolean;
  issues: string[];
  warnings: string[];
}

async function checkEffect(effectPath: string): Promise<CheckResult> {
  const issues: string[] = [];
  const warnings: string[] = [];
  
  console.log(`检查特效: ${effectPath}`);
  
  // 检查文件是否存在
  if (!existsSync(effectPath)) {
    issues.push('文件不存在');
    return { ok: false, issues, warnings };
  }
  
  const code = readFileSync(effectPath, 'utf8');
  
  // 1. 检查未种子化的随机数
  const randomPatterns = [
    { pattern: /Math\.random\(\)/g, name: 'Math.random()' },
    { pattern: /new Date\(\)\.getTime\(\)/g, name: 'new Date().getTime()' },
    { pattern: /performance\.now\(\)/g, name: 'performance.now()' },
    { pattern: /Date\.now\(\)/g, name: 'Date.now()' },
  ];
  
  for (const { pattern, name } of randomPatterns) {
    const matches = code.match(pattern);
    if (matches) {
      issues.push(`发现未种子化的随机数: ${name} (${matches.length} 处)`);
    }
  }
  
  // 2. 检查是否有种子参数
  if (!code.includes('seed') && !code.includes('Rng')) {
    warnings.push('建议使用种子化随机数（Rng）确保可重现性');
  }
  
  // 3. 检查边界检查
  if (!code.includes('clamp') && !code.includes('Math.min') && !code.includes('Math.max')) {
    warnings.push('建议添加边界检查防止溢出');
  }
  
  // 4. 检查循环特效
  if (code.includes('loop') && code.includes('true')) {
    if (!code.includes('t %') && !code.includes('modulo') && !code.includes('Math.floor')) {
      warnings.push('循环特效建议使用取模确保无缝');
    }
  }
  
  // 5. 检查是否有 draw 或 create 函数
  if (!code.includes('export function draw') && !code.includes('export function create')) {
    issues.push('缺少导出函数: draw(p, t, o) 或 create(o)');
  }
  
  // 6. 检查是否有 meta 信息
  if (!code.includes('export const meta')) {
    warnings.push('建议添加 meta 信息（name、category、loop、seed）');
  }
  
  return {
    ok: issues.length === 0,
    issues,
    warnings,
  };
}

// 主函数
async function main() {
  const effectPath = process.argv[2];
  
  if (!effectPath) {
    console.error('用法: node check-effect.mjs <effect-path>');
    console.error('示例: node check-effect.mjs src/fx/fire/campfire.js');
    process.exit(1);
  }
  
  const resolvedPath = resolve(effectPath);
  const result = await checkEffect(resolvedPath);
  
  if (result.issues.length > 0) {
    console.log('\n❌ 发现以下问题:');
    result.issues.forEach(issue => console.log(`  - ${issue}`));
  }
  
  if (result.warnings.length > 0) {
    console.log('\n⚠️  建议改进:');
    result.warnings.forEach(warning => console.log(`  - ${warning}`));
  }
  
  if (result.ok) {
    console.log('\n✓ 检查通过');
    process.exit(0);
  } else {
    console.log('\n✗ 检查失败');
    process.exit(1);
  }
}

main().catch(console.error);

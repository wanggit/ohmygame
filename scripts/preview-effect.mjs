#!/usr/bin/env node

/**
 * 特效可视化预览工具（借鉴 pixelfx）
 * 
 * 生成 contact sheet 预览
 * 用法: node preview-effect.mjs <effect-path> [options]
 */

import { createFrame, clearFrame, composite, Painter } from '../src/shared/effects/frame.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname, basename, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface PreviewOptions {
  frames?: number;
  fps?: number;
  width?: number;
  height?: number;
  outputDir?: string;
  seed?: number;
}

async function previewEffect(effectPath: string, options: PreviewOptions = {}) {
  const {
    frames = 30,
    fps = 12,
    width = 128,
    height = 128,
    outputDir = 'records',
    seed = 42,
  } = options;
  
  console.log(`预览特效: ${effectPath}`);
  console.log(`参数: ${frames} 帧, ${fps} fps, ${width}x${height}`);
  
  // 动态导入特效
  const effectModule = await import(resolve(effectPath));
  
  // 创建帧缓冲
  const frame = createFrame(width, height);
  const painter = new Painter(frame);
  
  // 生成帧数据
  const framesData: Uint32Array[] = [];
  
  for (let i = 0; i < frames; i++) {
    const time = i / fps;
    
    clearFrame(frame);
    
    if (effectModule.draw) {
      // 纯特效
      effectModule.draw(painter, time, { seed });
    } else if (effectModule.create) {
      // 模拟特效
      const effect = effectModule.create({ seed });
      effect.update(1 / fps);
      effect.draw(painter);
    } else {
      console.error('错误: 特效必须导出 draw(p, t, o) 或 create(o) 函数');
      process.exit(1);
    }
    
    // 保存帧数据
    framesData.push(new Uint32Array(frame.color));
  }
  
  // 生成文本预览（ASCII art）
  const outputPath = join(outputDir, basename(effectPath, '.js'));
  mkdirSync(outputPath, { recursive: true });
  
  // 生成帧统计
  const stats = analyzeFrames(framesData, width, height);
  
  // 保存统计信息
  const statsPath = join(outputPath, 'stats.json');
  writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  
  // 生成 ASCII 预览
  const asciiPreview = generateAsciiPreview(framesData[0], width, height);
  const previewPath = join(outputPath, 'preview.txt');
  writeFileSync(previewPath, asciiPreview);
  
  console.log(`\n✓ 预览已生成:`);
  console.log(`  - 统计信息: ${statsPath}`);
  console.log(`  - ASCII 预览: ${previewPath}`);
  console.log(`\n📊 特效统计:`);
  console.log(`  - 活跃像素: ${stats.activePixels} (${stats.activePercent.toFixed(1)}%)`);
  console.log(`  - 颜色数量: ${stats.uniqueColors}`);
  console.log(`  - 光照像素: ${stats.lightPixels}`);
  console.log(`  - 边界溢出: ${stats.spills ? '是' : '否'}`);
}

function analyzeFrames(framesData: Uint32Array[], width: number, height: number) {
  const uniqueColors = new Set<number>();
  let activePixels = 0;
  let lightPixels = 0;
  let spills = false;
  
  for (const frameData of framesData) {
    for (let i = 0; i < frameData.length; i++) {
      const color = frameData[i];
      if (color > 0) {
        activePixels++;
        uniqueColors.add(color);
        
        // 检查是否在边界
        const x = i % width;
        const y = Math.floor(i / width);
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
          spills = true;
        }
      }
    }
  }
  
  const totalPixels = framesData.length * width * height;
  
  return {
    frames: framesData.length,
    width,
    height,
    activePixels,
    activePercent: (activePixels / totalPixels) * 100,
    uniqueColors: uniqueColors.size,
    lightPixels,
    spills,
  };
}

function generateAsciiPreview(frameData: Uint32Array, width: number, height: number): string {
  const chars = ' .:-=+*#%@';
  let output = '';
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const color = frameData[idx];
      
      if (color === 0) {
        output += ' ';
      } else {
        // 计算亮度
        const r = (color >> 16) & 0xff;
        const g = (color >> 8) & 0xff;
        const b = color & 0xff;
        const brightness = (r + g + b) / 3 / 255;
        const charIdx = Math.min(chars.length - 1, Math.floor(brightness * chars.length));
        output += chars[charIdx];
      }
    }
    output += '\n';
  }
  
  return output;
}

// 主函数
async function main() {
  const effectPath = process.argv[2];
  
  if (!effectPath) {
    console.error('用法: node preview-effect.mjs <effect-path> [options]');
    console.error('示例: node preview-effect.mjs src/fx/fire/campfire.js');
    console.error('\n选项:');
    console.error('  --frames <n>    帧数 (默认: 30)');
    console.error('  --fps <n>       帧率 (默认: 12)');
    console.error('  --width <n>     宽度 (默认: 128)');
    console.error('  --height <n>    高度 (默认: 128)');
    console.error('  --output <dir>  输出目录 (默认: records)');
    console.error('  --seed <n>      随机种子 (默认: 42)');
    process.exit(1);
  }
  
  // 解析选项
  const options: PreviewOptions = {};
  for (let i = 3; i < process.argv.length; i += 2) {
    const key = process.argv[i];
    const value = process.argv[i + 1];
    
    switch (key) {
      case '--frames':
        options.frames = parseInt(value);
        break;
      case '--fps':
        options.fps = parseInt(value);
        break;
      case '--width':
        options.width = parseInt(value);
        break;
      case '--height':
        options.height = parseInt(value);
        break;
      case '--output':
        options.outputDir = value;
        break;
      case '--seed':
        options.seed = parseInt(value);
        break;
    }
  }
  
  await previewEffect(effectPath, options);
}

main().catch(console.error);

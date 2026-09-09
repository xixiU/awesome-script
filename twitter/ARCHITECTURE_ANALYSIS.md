# Twitter X Toolkit 代码架构分析

## 📊 当前状态

- **代码行数**: 4347 行
- **函数数量**: 72 个
- **全局变量**: 50+ 个
- **文件结构**: 单文件 (twitter_x_toolkit.user.js)

## 🔍 主要问题

### 1. 架构问题

#### 1.1 单文件巨石结构
- **问题**: 所有功能堆在一个 4300+ 行的文件中
- **影响**: 
  - 难以维护和定位问题
  - 合并冲突风险高
  - IDE 性能下降
  - 代码复用困难

#### 1.2 模块边界不清晰
当前功能混杂在一起：
- 屏蔽功能
- AI 总结
- AI 过滤
- 启发式学习
- UI 组件
- 工具函数

#### 1.3 全局状态污染
50+ 个模块级变量散落各处：
```javascript
let isBlocking = false;
let blockedCount = 0;
let isSummarizing = false;
let commentObserver = null;
let aiFilterInProgress = false;
// ... 还有 45+ 个
```

### 2. 性能问题

#### 2.1 MutationObserver 性能
```javascript
// 监听整个 primaryColumn 的所有变化
commentObserver.observe(targetNode, {
    childList: true,
    subtree: true  // 递归监听所有子节点
});
```
- **问题**: 每次 DOM 变化都触发回调
- **优化**: 使用 throttle + 增量处理

#### 2.2 重复的 DOM 查询
```javascript
// 在多处重复查询
document.querySelectorAll('article[data-testid="tweet"]')
```
- **问题**: 每次都全量遍历 DOM
- **优化**: 缓存查询结果 + WeakMap

#### 2.3 启发式学习算法复杂度
```javascript
// learnHeuristicPatterns 中的多重循环
for (const p of patterns) {
    for (const [existingText, existingPattern] of deduped) {
        if (isSameTemplate(p.text, existingText)) {
            // O(n²) 复杂度
        }
    }
}
```
- **问题**: O(n²) 复杂度，100 条规则需要 10000 次比较
- **优化**: 使用 trie 树或分组索引

#### 2.4 编辑距离算法开销
```javascript
function levenshteinDistance(str1, str2) {
    // 动态规划，O(m*n) 空间和时间
    const dp = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
}
```
- **问题**: 每次比较都创建二维数组
- **优化**: 优化为 O(n) 空间复杂度

### 3. 代码质量问题

#### 3.1 重复代码
```javascript
// 类似的模式重复多次
if (!isOnTweetDetailPage()) return;
// ... 在 10+ 个函数中重复
```

#### 3.2 深度嵌套
```javascript
// autoAIFilterComments 中 5+ 层嵌套
for (const c of allComments) {
    for (const pattern of heuristicPatterns) {
        if (matchHeuristicPattern(pattern, c.displayName, c.text)) {
            for (const [username, hit] of similarityHits) {
                // ...
            }
        }
    }
}
```

#### 3.3 魔法数字
```javascript
const WORD_SPLIT_THRESHOLD = 3;
const SIMILARITY_MIN_LENGTH = 10;
const SIMILARITY_THRESHOLD = 0.9;
// ... 20+ 个散落各处
```

#### 3.4 缺乏类型注释
- 没有 JSDoc 类型标注
- 参数和返回值类型不明确
- IDE 智能提示差

### 4. 功能问题

#### 4.1 错误处理不完善
```javascript
try {
    const result = await someOperation();
} catch (error) {
    console.error('操作失败:', error);
    // 缺少用户友好的错误提示
    // 缺少错误恢复机制
}
```

#### 4.2 配置管理混乱
- 部分配置在 ConfigManager
- 部分配置硬编码
- 缺少配置验证

#### 4.3 内存泄漏风险
```javascript
// 无限增长的缓存
const userInfoCache = new Map();
const blockOutcome = new Map();
// 缺少 LRU 淘汰机制
```

## 🎯 优化方案

### 短期优化（1-2周）

#### 1. 性能优化

**优化 MutationObserver**
```javascript
// 使用 throttle 减少触发频率
const throttledReapply = throttle(() => {
    reapplyBlockedHiding();
}, 200);

commentObserver = new MutationObserver(throttledReapply);
```

**优化编辑距离算法**
```javascript
// 优化为 O(n) 空间复杂度
function levenshteinDistanceOptimized(str1, str2) {
    if (Math.abs(str1.length - str2.length) > 3) return Infinity;
    
    let prevRow = Array(str2.length + 1).fill(0).map((_, i) => i);
    let currRow = Array(str2.length + 1);
    
    for (let i = 1; i <= str1.length; i++) {
        currRow[0] = i;
        for (let j = 1; j <= str2.length; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                currRow[j] = prevRow[j - 1];
            } else {
                currRow[j] = Math.min(
                    prevRow[j] + 1,
                    currRow[j - 1] + 1,
                    prevRow[j - 1] + 1
                );
            }
        }
        [prevRow, currRow] = [currRow, prevRow];
    }
    
    return prevRow[str2.length];
}
```

**添加 LRU 缓存**
```javascript
class LRUCache {
    constructor(capacity) {
        this.capacity = capacity;
        this.cache = new Map();
    }
    
    get(key) {
        if (!this.cache.has(key)) return null;
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }
    
    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.capacity) {
            this.cache.delete(this.cache.keys().next().value);
        }
        this.cache.set(key, value);
    }
}

const userInfoCache = new LRUCache(500);
```

**优化模板匹配**
```javascript
// 使用 hash 分组减少比较次数
function groupPatternsByLength(patterns) {
    const groups = new Map();
    for (const p of patterns) {
        const len = p.text.length;
        if (!groups.has(len)) groups.set(len, []);
        groups.get(len).push(p);
    }
    return groups;
}

// 只比较长度相近的模式（±3）
const grouped = groupPatternsByLength(patterns);
for (const p of patterns) {
    for (let len = p.text.length - 3; len <= p.text.length + 3; len++) {
        const candidates = grouped.get(len) || [];
        for (const candidate of candidates) {
            if (isSameTemplate(p.text, candidate.text)) {
                // ...
            }
        }
    }
}
```

#### 2. 代码质量改进

**提取常量配置**
```javascript
// 新增 constants.js
const CONFIG = {
    THRESHOLDS: {
        WORD_SPLIT: 3,
        SIMILARITY_MIN_LENGTH: 10,
        SIMILARITY_THRESHOLD: 0.9,
        HISTORY_SIMILARITY: 0.92,
        LEARN_TRIGGER_COUNT: 5,
        CLUSTER_MIN_SIZE: 2
    },
    CACHE: {
        USER_INFO_SIZE: 500,
        CORPUS_CAP: 500,
        VERDICT_TTL: 7 * 24 * 60 * 60 * 1000
    },
    TIMING: {
        REAPPLY_DEBOUNCE: 100,
        AI_FILTER_DEBOUNCE: 300,
        SCROLL_WAIT: 500
    }
};
```

**添加工具函数库**
```javascript
// utils.js
const Utils = {
    sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
    
    throttle: (fn, delay) => {
        let lastCall = 0;
        return (...args) => {
            const now = Date.now();
            if (now - lastCall >= delay) {
                lastCall = now;
                return fn(...args);
            }
        };
    },
    
    debounce: (fn, delay) => {
        let timer = null;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    }
};
```

### 中期重构（1-2月）

#### 1. 模块化架构

```
twitter_x_toolkit/
├── core/
│   ├── config.js           # 配置管理
│   ├── state.js            # 状态管理
│   └── events.js           # 事件总线
├── features/
│   ├── block/
│   │   ├── blockManager.js
│   │   └── blockUI.js
│   ├── aiFilter/
│   │   ├── filterEngine.js
│   │   ├── heuristic.js
│   │   └── similarity.js
│   ├── aiSummary/
│   │   ├── summarizer.js
│   │   └── summaryUI.js
│   └── ui/
│       ├── toolbar.js
│       ├── panel.js
│       └── notification.js
├── utils/
│   ├── dom.js
│   ├── cache.js
│   ├── similarity.js
│   └── constants.js
└── main.js                 # 入口
```

#### 2. 状态管理

```javascript
// 使用统一的状态管理器
class StateManager {
    constructor() {
        this.state = {
            blocking: {
                inProgress: false,
                count: 0,
                users: []
            },
            aiFilter: {
                inProgress: false,
                processed: new Set()
            },
            cache: {
                userInfo: new LRUCache(500),
                verdict: new LRUCache(1000)
            }
        };
        this.listeners = new Map();
    }
    
    get(path) {
        return path.split('.').reduce((obj, key) => obj?.[key], this.state);
    }
    
    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((obj, key) => obj[key], this.state);
        target[lastKey] = value;
        this.notify(path, value);
    }
    
    subscribe(path, callback) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, []);
        }
        this.listeners.get(path).push(callback);
    }
    
    notify(path, value) {
        const callbacks = this.listeners.get(path) || [];
        callbacks.forEach(cb => cb(value));
    }
}
```

### 长期演进（3-6月）

#### 1. TypeScript 迁移
- 添加完整的类型定义
- 提高代码可维护性
- 减少运行时错误

#### 2. 测试覆盖
```javascript
// 添加单元测试
describe('HeuristicLearning', () => {
    test('should merge template variants', () => {
        const patterns = [
            { text: '应该没人比我玩的开了吧', count: 5 },
            { text: '应该没人比她玩的开了吧', count: 3 },
            { text: '应该没人比他玩的开了吧', count: 2 }
        ];
        
        const merged = mergeTemplateVariants(patterns);
        
        expect(merged).toHaveLength(1);
        expect(merged[0].count).toBe(10);
    });
});
```

#### 3. 性能监控
```javascript
class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
    }
    
    measure(name, fn) {
        const start = performance.now();
        const result = fn();
        const duration = performance.now() - start;
        
        this.record(name, duration);
        
        if (duration > 100) {
            console.warn(`⚠️ 性能警告: ${name} 耗时 ${duration.toFixed(2)}ms`);
        }
        
        return result;
    }
    
    record(name, duration) {
        if (!this.metrics.has(name)) {
            this.metrics.set(name, []);
        }
        this.metrics.get(name).push(duration);
    }
    
    getStats(name) {
        const data = this.metrics.get(name) || [];
        return {
            count: data.length,
            avg: data.reduce((a, b) => a + b, 0) / data.length,
            max: Math.max(...data),
            min: Math.min(...data)
        };
    }
}
```

## 📋 优先级建议

### P0 (立即处理)
1. ✅ 修复 MutationObserver 性能问题（已完成 v2.5.2）
2. ✅ 优化启发式学习规则质量（已完成 v2.5.3）
3. ✅ 添加模板合并功能（已完成 v2.6.0）
4. ⏳ 添加 LRU 缓存，防止内存泄漏

### P1 (本月内)
1. 优化编辑距离算法空间复杂度
2. 提取常量配置
3. 添加性能监控
4. 完善错误处理

### P2 (下个月)
1. 模块化重构（拆分文件）
2. 统一状态管理
3. 添加单元测试

### P3 (长期规划)
1. TypeScript 迁移
2. 构建工具链（webpack/rollup）
3. CI/CD 流程

## 🎯 建议的下一步

基于当前进度，建议优先处理：

1. **添加 LRU 缓存**（2小时）
   - 防止 userInfoCache 无限增长
   - 防止 blockOutcome 内存泄漏

2. **优化编辑距离算法**（1小时）
   - 降低空间复杂度
   - 提前终止机制

3. **提取常量配置**（1小时）
   - 统一管理阈值
   - 方便调优

这样可以在不大规模重构的情况下，快速提升性能和代码质量。

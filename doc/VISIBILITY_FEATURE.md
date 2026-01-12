# 笔记可见性设置功能

本功能为笔记系统添加了三种可见性级别，允许用户控制谁可以查看他们的笔记。

## 功能概述

### 可见性级别

1. **公开 (Public)** - 值: 0
   - 所有用户（包括未登录用户）都可以查看
   - 默认设置

2. **私密 (Private)** - 值: 1
   - 仅笔记作者本人可以查看
   - 其他用户无法查看此笔记

3. **仅互关好友可见 (Mutual Friends Only)** - 值: 2
   - 仅与作者互相关注的好友可以查看
   - 需要用户登录且与作者互相关注

## 数据库变更

### 迁移文件

已创建以下数据库迁移文件：
- `express-project/scripts/add-visibility-column.sql`
- `database/migrations/002_add_visibility.sql`

### 变更内容

```sql
-- 添加 visibility 列到 posts 表
ALTER TABLE `posts` 
ADD COLUMN `visibility` tinyint(1) NOT NULL DEFAULT 0 
COMMENT '可见性：0-公开，1-私密，2-仅互关好友可见' 
AFTER `is_draft`;

-- 添加索引以提高查询性能
ALTER TABLE `posts` 
ADD INDEX `idx_visibility` (`visibility`);

-- 添加组合索引以优化常见查询
ALTER TABLE `posts` 
ADD INDEX `idx_is_draft_visibility` (`is_draft`, `visibility`);
```

### 执行迁移

在数据库中执行迁移：

```bash
# 使用 MySQL 客户端
mysql -u root -p xiaoshiliu < express-project/scripts/add-visibility-column.sql
```

或者使用 Docker：

```bash
docker exec -i xiaoshiliu-mysql mysql -u root -p123456 xiaoshiliu < express-project/scripts/add-visibility-column.sql
```

## 后端实现

### 1. 可见性助手工具 (`express-project/utils/visibilityHelper.js`)

提供以下功能：

- `VISIBILITY` - 可见性常量定义
- `areMutualFriends(userId1, userId2)` - 检查两个用户是否互相关注
- `canViewPost(postId, currentUserId, post)` - 检查用户是否有权查看指定笔记
- `getVisibilityWhereClause(currentUserId, postTableAlias)` - 生成可见性过滤的 WHERE 条件
- `filterPostsByVisibility(posts, currentUserId)` - 过滤笔记列表，移除无权查看的笔记

### 2. API 端点更新

#### 创建笔记 (POST /api/posts)
- 接受 `visibility` 参数
- 默认值为 0（公开）
- 验证可见性值的有效性

```javascript
{
  "title": "笔记标题",
  "content": "笔记内容",
  "visibility": 0,  // 0=公开, 1=私密, 2=仅互关好友可见
  // ... 其他字段
}
```

#### 更新笔记 (PUT /api/posts/:id)
- 支持更新 `visibility` 字段
- 仅笔记作者可以修改

#### 获取笔记列表 (GET /api/posts)
- 根据用户登录状态和可见性设置过滤笔记
- 未登录用户只能看到公开笔记
- 已登录用户可以看到：
  - 自己的所有笔记
  - 公开的笔记
  - 互关好友的笔记（如果设置为仅互关好友可见）

#### 获取笔记详情 (GET /api/posts/:id)
- 检查用户是否有权查看笔记
- 返回相应的错误信息：
  - `DRAFT_ONLY_AUTHOR`: 草稿仅作者可见
  - `PRIVATE`: 该笔记为私密笔记
  - `LOGIN_REQUIRED`: 查看该笔记需要登录
  - `NOT_MUTUAL_FRIENDS`: 该笔记仅互关好友可见

#### 获取关注用户笔记 (GET /api/posts/following)
- 应用可见性过滤
- 只显示有权查看的关注用户笔记

#### 搜索笔记 (GET /api/posts/search)
- 搜索结果中应用可见性过滤
- 只返回有权查看的笔记

## 前端实现

### 1. 发布表单 (`vue3-project/src/views/publish/index.vue`)

添加了可见性选择器：

```vue
<div class="visibility-section">
  <div class="section-title">可见性</div>
  <DropdownSelect 
    v-model="form.visibility" 
    :options="visibilityOptions" 
    placeholder="请选择可见性" 
    label-key="label"
    value-key="value" 
  />
</div>
```

可见性选项：
```javascript
const visibilityOptions = [
  { value: 0, label: '公开' },
  { value: 1, label: '私密' },
  { value: 2, label: '仅互关好友可见' }
]
```

### 2. 编辑模态框 (`vue3-project/src/views/post-management/components/EditPostModal.vue`)

- 添加了可见性字段到表单
- 支持编辑现有笔记的可见性设置
- 加载草稿时自动填充可见性值

## 使用示例

### 创建公开笔记

```javascript
const postData = {
  title: "我的公开笔记",
  content: "这是一篇公开笔记",
  visibility: 0,  // 公开
  // ... 其他字段
}
await createPost(postData)
```

### 创建私密笔记

```javascript
const postData = {
  title: "我的私密笔记",
  content: "这是一篇私密笔记，只有我能看到",
  visibility: 1,  // 私密
  // ... 其他字段
}
await createPost(postData)
```

### 创建互关好友可见笔记

```javascript
const postData = {
  title: "给好友的笔记",
  content: "这篇笔记只有互关好友能看到",
  visibility: 2,  // 仅互关好友可见
  // ... 其他字段
}
await createPost(postData)
```

## 测试建议

### 1. 公开笔记测试
- [ ] 创建一篇公开笔记
- [ ] 登出后验证可以查看该笔记
- [ ] 其他用户可以查看该笔记
- [ ] 笔记出现在搜索结果中

### 2. 私密笔记测试
- [ ] 创建一篇私密笔记
- [ ] 验证作者可以查看
- [ ] 登出后无法查看该笔记
- [ ] 其他用户无法查看该笔记
- [ ] 笔记不出现在其他用户的搜索结果中

### 3. 互关好友可见笔记测试
- [ ] 用户 A 关注用户 B
- [ ] 用户 B 关注用户 A（建立互关关系）
- [ ] 用户 A 创建一篇仅互关好友可见的笔记
- [ ] 验证用户 B 可以查看该笔记
- [ ] 用户 C（未互关）无法查看该笔记
- [ ] 登出后无法查看该笔记

### 4. 更新可见性测试
- [ ] 创建一篇公开笔记
- [ ] 将笔记更新为私密
- [ ] 验证其他用户无法再查看
- [ ] 将笔记更新为互关好友可见
- [ ] 验证互关好友可以查看

### 5. 默认值测试
- [ ] 创建笔记时不指定 visibility
- [ ] 验证默认为公开（值为 0）

## 性能优化

1. **索引优化**
   - 为 `visibility` 字段添加了单独索引
   - 为常用组合查询 `(is_draft, visibility)` 添加了组合索引

2. **批量查询**
   - 使用批量查询获取互关关系，避免 N+1 查询问题
   - 在列表查询中先通过 SQL 过滤，再通过代码进行精细过滤

3. **查询优化**
   - 未登录用户直接通过 SQL WHERE 条件过滤
   - 已登录用户通过 SQL 初步过滤后，再检查互关关系

## 注意事项

1. **向后兼容**
   - 默认值为 0（公开），确保现有笔记保持公开状态
   - 前端表单默认选择公开选项

2. **权限验证**
   - 所有查询笔记的端点都应用了可见性过滤
   - 笔记详情页面会检查查看权限并返回适当的错误信息

3. **互关关系检查**
   - 互关好友的检查需要额外的数据库查询
   - 在列表查询中使用批量查询优化性能

4. **草稿笔记**
   - 草稿笔记始终仅作者可见，不受可见性设置影响
   - 发布后才应用可见性设置

## 未来改进建议

1. **缓存优化**
   - 缓存用户的互关关系列表
   - 减少重复的数据库查询

2. **通知功能**
   - 当笔记可见性从公开改为私密时，通知相关用户
   - 提醒用户笔记可见性变更

3. **批量操作**
   - 支持批量修改笔记的可见性
   - 提供快速设置所有笔记为私密的功能

4. **统计功能**
   - 显示不同可见性级别的笔记数量
   - 提供可见性分布的统计图表

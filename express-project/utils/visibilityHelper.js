const { pool } = require('../config/config');

/**
 * 可见性常量
 */
const VISIBILITY = {
  PUBLIC: 0,           // 公开
  PRIVATE: 1,          // 私密
  MUTUAL_FRIENDS: 2    // 仅互关好友可见
};

/**
 * 检查两个用户是否互相关注（互关好友）
 * @param {number} userId1 - 用户1的ID
 * @param {number} userId2 - 用户2的ID
 * @returns {Promise<boolean>} - 是否互相关注
 */
async function areMutualFriends(userId1, userId2) {
  if (!userId1 || !userId2) {
    return false;
  }
  
  try {
    // 检查用户1是否关注用户2，且用户2是否关注用户1
    const [result] = await pool.execute(
      `SELECT 
        (SELECT COUNT(*) FROM follows WHERE follower_id = ? AND following_id = ?) as user1_follows_user2,
        (SELECT COUNT(*) FROM follows WHERE follower_id = ? AND following_id = ?) as user2_follows_user1`,
      [userId1, userId2, userId2, userId1]
    );
    
    const user1FollowsUser2 = result[0].user1_follows_user2 > 0;
    const user2FollowsUser1 = result[0].user2_follows_user1 > 0;
    
    return user1FollowsUser2 && user2FollowsUser1;
  } catch (error) {
    console.error('检查互关关系失败:', error);
    return false;
  }
}

/**
 * 检查用户是否有权查看指定笔记
 * @param {number} postId - 笔记ID
 * @param {number} currentUserId - 当前用户ID（可以为null表示未登录用户）
 * @param {Object} post - 笔记对象（可选，如果提供则不需要再查询数据库）
 * @returns {Promise<Object>} - { hasAccess: boolean, reason: string }
 */
async function canViewPost(postId, currentUserId, post = null) {
  try {
    // 如果没有提供post对象，从数据库查询
    if (!post) {
      const [posts] = await pool.execute(
        'SELECT id, user_id, visibility, is_draft FROM posts WHERE id = ?',
        [postId]
      );
      
      if (posts.length === 0) {
        return { hasAccess: false, reason: 'POST_NOT_FOUND' };
      }
      
      post = posts[0];
    }
    
    // 草稿只有作者可以查看
    if (post.is_draft === 1) {
      if (!currentUserId || currentUserId !== post.user_id) {
        return { hasAccess: false, reason: 'DRAFT_ONLY_AUTHOR' };
      }
      return { hasAccess: true, reason: 'AUTHOR' };
    }
    
    // 作者可以查看自己的所有笔记
    if (currentUserId && currentUserId === post.user_id) {
      return { hasAccess: true, reason: 'AUTHOR' };
    }
    
    // 根据可见性检查权限
    switch (post.visibility) {
      case VISIBILITY.PUBLIC:
        // 公开：所有人可见
        return { hasAccess: true, reason: 'PUBLIC' };
        
      case VISIBILITY.PRIVATE:
        // 私密：只有作者可见
        return { hasAccess: false, reason: 'PRIVATE' };
        
      case VISIBILITY.MUTUAL_FRIENDS:
        // 仅互关好友可见：需要登录且互相关注
        if (!currentUserId) {
          return { hasAccess: false, reason: 'LOGIN_REQUIRED' };
        }
        
        const isMutual = await areMutualFriends(currentUserId, post.user_id);
        if (isMutual) {
          return { hasAccess: true, reason: 'MUTUAL_FRIENDS' };
        } else {
          return { hasAccess: false, reason: 'NOT_MUTUAL_FRIENDS' };
        }
        
      default:
        // 未知可见性类型，默认私密
        return { hasAccess: false, reason: 'UNKNOWN_VISIBILITY' };
    }
  } catch (error) {
    console.error('检查笔记可见性失败:', error);
    return { hasAccess: false, reason: 'ERROR' };
  }
}

/**
 * 生成可见性过滤的WHERE条件
 * @param {number} currentUserId - 当前用户ID（可以为null）
 * @param {string} postTableAlias - posts表的别名，默认为'p'
 * @returns {Object} - { condition: string, params: array }
 */
function getVisibilityWhereClause(currentUserId, postTableAlias = 'p') {
  if (!currentUserId) {
    // 未登录用户：只能看到公开的笔记
    return {
      condition: `${postTableAlias}.visibility = ?`,
      params: [VISIBILITY.PUBLIC]
    };
  }
  
  // 已登录用户：可以看到自己的所有笔记、公开的笔记、以及互关好友的笔记
  // 注意：互关好友的检查需要在查询结果后过滤，这里先包含所有非私密的笔记
  return {
    condition: `(${postTableAlias}.user_id = ? OR ${postTableAlias}.visibility IN (?, ?))`,
    params: [currentUserId, VISIBILITY.PUBLIC, VISIBILITY.MUTUAL_FRIENDS]
  };
}

/**
 * 过滤笔记列表，移除当前用户无权查看的笔记
 * @param {Array} posts - 笔记数组
 * @param {number} currentUserId - 当前用户ID（可以为null）
 * @returns {Promise<Array>} - 过滤后的笔记数组
 */
async function filterPostsByVisibility(posts, currentUserId) {
  if (!posts || posts.length === 0) {
    return [];
  }
  
  // 如果未登录，只保留公开的笔记
  if (!currentUserId) {
    return posts.filter(post => post.visibility === VISIBILITY.PUBLIC);
  }
  
  // 获取所有需要检查互关关系的笔记（visibility = MUTUAL_FRIENDS 且不是作者）
  const mutualFriendsPosts = posts.filter(
    post => post.visibility === VISIBILITY.MUTUAL_FRIENDS && post.user_id !== currentUserId
  );
  
  // 如果没有需要检查互关的笔记，直接过滤
  if (mutualFriendsPosts.length === 0) {
    return posts.filter(post => {
      // 作者可以看到自己的所有笔记
      if (post.user_id === currentUserId) return true;
      // 公开的笔记所有人可见
      if (post.visibility === VISIBILITY.PUBLIC) return true;
      // 私密笔记只有作者可见
      if (post.visibility === VISIBILITY.PRIVATE) return false;
      return false;
    });
  }
  
  // 批量检查互关关系
  const authorIds = [...new Set(mutualFriendsPosts.map(post => post.user_id))];
  const mutualFriendsSet = new Set();
  
  for (const authorId of authorIds) {
    const isMutual = await areMutualFriends(currentUserId, authorId);
    if (isMutual) {
      mutualFriendsSet.add(authorId);
    }
  }
  
  // 过滤笔记
  return posts.filter(post => {
    // 作者可以看到自己的所有笔记
    if (post.user_id === currentUserId) return true;
    // 公开的笔记所有人可见
    if (post.visibility === VISIBILITY.PUBLIC) return true;
    // 私密笔记只有作者可见
    if (post.visibility === VISIBILITY.PRIVATE) return false;
    // 互关好友笔记：检查是否互关
    if (post.visibility === VISIBILITY.MUTUAL_FRIENDS) {
      return mutualFriendsSet.has(post.user_id);
    }
    return false;
  });
}

module.exports = {
  VISIBILITY,
  areMutualFriends,
  canViewPost,
  getVisibilityWhereClause,
  filterPostsByVisibility
};

// accountQuery.js - 账号查询模块（订阅类型和积分）
// 独立模块，不依赖注册流程

/**
 * 账号查询管理器
 */
const AccountQuery = {
  /**
   * 使用 refresh_token 获取 access_token
   */
  async getAccessToken(refreshToken) {
    const axios = require('axios');
    const FIREBASE_API_KEY = 'AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY';
    const WORKER_URL = 'https://windsurf.crispvibe.cn';
    
    try {
      // 使用 Cloudflare Workers 中转（国内可访问）
      const response = await axios.post(
        WORKER_URL,
        {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          api_key: FIREBASE_API_KEY
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }
      );
      
      return {
        accessToken: response.data.id_token,
        refreshToken: response.data.refresh_token,
        expiresIn: parseInt(response.data.expires_in)
      };
    } catch (error) {
      throw new Error(`获取 access_token 失败: ${error.response?.data?.error?.message || error.message}`);
    }
  },

  /**
   * 查询账号使用情况（订阅类型和积分）
   * 使用简化方式：直接用 JSON 格式请求
   */
  async getUsageInfo(accessToken) {
    const axios = require('axios');
    
    try {
      // 方式1: 尝试使用 JSON 格式（简单）
      try {
        const response = await axios.post(
          'https://web-backend.windsurf.com/exa.seat_management_pb.SeatManagementService/GetPlanStatus',
          {
            auth_token: accessToken
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Auth-Token': accessToken,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'x-client-version': 'Chrome/JsCore/11.0.0/FirebaseCore-web'
            }
          }
        );
        
        // 解析响应
        const planStatus = response.data.planStatus || response.data;
        
        return {
          planName: planStatus.planInfo?.planName || 'Free',
          usedCredits: Math.round((planStatus.usedPromptCredits || 0) / 100),
          totalCredits: Math.round((planStatus.availablePromptCredits || 0) / 100),
          usagePercentage: 0,
          expiresAt: planStatus.planInfo?.expiresAt || planStatus.expiresAt || null, // 到期时间
          planInfo: planStatus.planInfo || null // 完整的套餐信息
        };
      } catch (jsonError) {
        // 如果 JSON 方式失败，返回默认值
        console.warn('JSON 方式查询失败，返回默认值:', jsonError.message);
        return {
          planName: 'Free',
          usedCredits: 0,
          totalCredits: 500,
          usagePercentage: 0
        };
      }
    } catch (error) {
      throw new Error(`查询使用情况失败: ${error.message}`);
    }
  },

  /**
   * 查询单个账号的完整信息
   */
  async queryAccount(account) {
    try {
      // 检查是否有 refreshToken
      if (!account.refreshToken) {
        return {
          success: false,
          error: '账号缺少 refreshToken',
          planName: 'Unknown',
          usedCredits: 0,
          totalCredits: 0
        };
      }

      // 1. 获取 access_token
      const { accessToken } = await this.getAccessToken(account.refreshToken);
      
      // 2. 查询使用情况
      const usageInfo = await this.getUsageInfo(accessToken);
      
      // 计算使用百分比
      if (usageInfo.totalCredits > 0) {
        usageInfo.usagePercentage = Math.round((usageInfo.usedCredits / usageInfo.totalCredits) * 100);
      }
      
      return {
        success: true,
        ...usageInfo
      };
    } catch (error) {
      console.error(`查询账号 ${account.email} 失败:`, error);
      return {
        success: false,
        error: error.message,
        planName: 'Error',
        usedCredits: 0,
        totalCredits: 0,
        usagePercentage: 0
      };
    }
  },

  /**
   * 批量查询所有账号
   */
  async queryAllAccounts(accounts) {
    const results = [];
    
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      
      try {
        const result = await this.queryAccount(account);
        results.push({
          email: account.email,
          ...result
        });
        
        if (!result.success) {
          console.error(`[账号查询] ❌ ${account.email} - ${result.error}`);
        }
      } catch (error) {
        console.error(`[账号查询] ❌ ${account.email} - ${error.message}`);
        results.push({
          email: account.email,
          success: false,
          error: error.message,
          planName: 'Error',
          usedCredits: 0,
          totalCredits: 0,
          usagePercentage: 0
        });
      }
      
      // 避免请求过快，延迟 500ms
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return results;
  }
};

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AccountQuery;
}

// 全局函数（用于 HTML 调用）
if (typeof window !== 'undefined') {
  window.AccountQuery = AccountQuery;
}

/**
 * 查询并更新账号列表的订阅和积分信息
 */
async function updateAccountsUsage() {
  try {
    // 获取所有账号
    const result = await window.ipcRenderer.invoke('get-accounts');
    
    if (!result || !result.success || !result.accounts) {
      return;
    }
    
    const accounts = result.accounts;
    
    // 批量查询
    const results = await AccountQuery.queryAllAccounts(accounts);
    
    // 更新 UI
    let updateCount = 0;
    results.forEach(result => {
      const updated = updateAccountUI(result.email, result);
      if (updated) {
        updateCount++;
      }
    });
  } catch (error) {
    console.error('[自动查询] 查询失败:', error);
  }
}

/**
 * 更新单个账号的 UI 显示
 * @returns {Boolean} 是否成功更新
 */
function updateAccountUI(email, usageInfo) {
  // 查找对应的账号行
  const accountRows = document.querySelectorAll('.account-row-data');
  
  if (accountRows.length === 0) {
    console.warn(`[UI更新] 未找到任何账号行`);
    return false;
  }
  
  for (const row of accountRows) {
    const rowEmail = row.querySelector('.account-col-email')?.textContent;
    
    if (rowEmail === email) {
      // 更新订阅类型
      const typeElement = row.querySelector('.account-col-type .type-badge');
      if (typeElement) {
        typeElement.textContent = usageInfo.planName || 'Free';
        
        // 根据套餐类型设置颜色
        if (usageInfo.planName === 'Pro') {
          typeElement.style.color = '#007aff';
        } else if (usageInfo.planName === 'Free') {
          typeElement.style.color = '#86868b';
        } else {
          typeElement.style.color = '#ff3b30';
        }
      }
      
      // 更新积分信息
      const creditsElement = row.querySelector('.account-col-credits');
      if (creditsElement) {
        if (usageInfo.success) {
          creditsElement.textContent = `${usageInfo.usedCredits}/${usageInfo.totalCredits}`;
          
          // 根据使用率设置颜色
          if (usageInfo.usagePercentage >= 80) {
            creditsElement.style.color = '#ff3b30';
          } else if (usageInfo.usagePercentage >= 50) {
            creditsElement.style.color = '#ff9500';
          } else {
            creditsElement.style.color = '#34c759';
          }
        } else {
          creditsElement.textContent = '查询失败';
          creditsElement.style.color = '#ff3b30';
        }
      }
      
      // 更新使用率
      const usageElement = row.querySelector('.account-col-usage');
      if (usageElement) {
        if (usageInfo.success) {
          usageElement.textContent = `${usageInfo.usagePercentage}%`;
          
          // 根据使用率设置颜色
          if (usageInfo.usagePercentage >= 80) {
            usageElement.style.color = '#ff3b30';
          } else if (usageInfo.usagePercentage >= 50) {
            usageElement.style.color = '#ff9500';
          } else {
            usageElement.style.color = '#34c759';
          }
        } else {
          usageElement.textContent = '-';
          usageElement.style.color = '#86868b';
        }
      }
      
      console.log(`[UI更新] ✅ 已更新 ${email} 的显示`);
      return true;
    }
  }
  
  console.warn(`[UI更新] ⚠️ 未找到 ${email} 对应的行`);
  return false;
}

// 存储定时器ID，用于重启
let autoQueryTimer = null;

/**
 * 启动自动定时查询
 * @param {Number} interval - 查询间隔（毫秒），默认 5 分钟
 */
function startAutoQuery(interval = 5 * 60 * 1000) {
  // 立即执行一次
  updateAccountsUsage();
  
  // 定时执行
  autoQueryTimer = setInterval(() => {
    updateAccountsUsage();
  }, interval);
  
  console.log(`[自动查询] 已启动，间隔: ${interval / 1000} 秒 (${interval / 60000} 分钟)`);
}

/**
 * 停止自动查询
 */
function stopAutoQuery() {
  if (autoQueryTimer) {
    clearInterval(autoQueryTimer);
    autoQueryTimer = null;
    console.log('[自动查询] 已停止');
  }
}

/**
 * 重启自动查询（用于配置更改后）
 * @param {Number} intervalMinutes - 查询间隔（分钟）
 */
function restartAutoQuery(intervalMinutes) {
  console.log(`[自动查询] 重启查询，新间隔: ${intervalMinutes} 分钟`);
  stopAutoQuery();
  const intervalMs = intervalMinutes * 60 * 1000;
  startAutoQuery(intervalMs);
}

// 挂载到全局，供配置页面调用
if (typeof window !== 'undefined') {
  window.restartAutoQuery = restartAutoQuery;
}

/**
 * 从配置中读取查询间隔
 */
function getQueryIntervalFromConfig() {
  try {
    // 从 localStorage 读取配置
    const configStr = localStorage.getItem('windsurfConfig');
    if (configStr) {
      const config = JSON.parse(configStr);
      const interval = parseInt(config.queryInterval);
      if (!isNaN(interval) && interval >= 1 && interval <= 1440) {
        return interval * 60 * 1000; // 转换为毫秒
      }
    }
  } catch (error) {
    console.error('[自动查询] 读取配置失败:', error);
  }
  // 默认 5 分钟
  return 5 * 60 * 1000;
}

// 页面加载时启动自动查询
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const interval = getQueryIntervalFromConfig();
    console.log(`[自动查询] 从配置读取间隔: ${interval / 60000} 分钟`);
    startAutoQuery(interval);
  });
}

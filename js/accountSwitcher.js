// accountSwitcher.js - Windsurf 账号切换模块
// 独立模块，支持跨平台（Windows/Mac/Linux）

const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

/**
 * Windsurf 路径检测器
 */
class WindsurfPathDetector {
  /**
   * 获取用户主目录（兼容 Electron 和 Node.js）
   */
  static getHomeDir() {
    try {
      // 尝试使用 Electron 的 app.getPath
      if (typeof app !== 'undefined' && app.getPath) {
        return app.getPath('home');
      }
    } catch (error) {
      // Electron 不可用
    }
    
    // 使用 Node.js 的 os.homedir()
    const os = require('os');
    return os.homedir();
  }
  
  /**
   * 获取 AppData 路径（兼容 Electron 和 Node.js）
   */
  static getAppDataDir() {
    try {
      // 尝试使用 Electron 的 app.getPath
      if (typeof app !== 'undefined' && app.getPath) {
        return app.getPath('appData');
      }
    } catch (error) {
      // Electron 不可用
    }
    
    // 使用 Node.js 方式
    const os = require('os');
    const homeDir = os.homedir();
    
    if (process.platform === 'win32') {
      return path.join(homeDir, 'AppData', 'Roaming');
    } else if (process.platform === 'darwin') {
      return path.join(homeDir, 'Library', 'Application Support');
    } else {
      return path.join(homeDir, '.config');
    }
  }
  
  /**
   * 获取 Windsurf 数据库路径
   */
  static getDBPath() {
    const platform = process.platform;
    
    if (platform === 'win32') {
      return path.join(this.getAppDataDir(), 'Windsurf/User/globalStorage/state.vscdb');
    } else if (platform === 'darwin') {
      return path.join(this.getHomeDir(), 'Library/Application Support/Windsurf/User/globalStorage/state.vscdb');
    }
    
    throw new Error(`不支持的平台: ${platform}`);
  }
  
  /**
   * 获取 Windsurf 用户数据目录
   */
  static getUserDataPath() {
    const platform = process.platform;
    
    if (platform === 'win32') {
      return path.join(this.getAppDataDir(), 'Windsurf');
    } else if (platform === 'darwin') {
      return path.join(this.getHomeDir(), 'Library/Application Support/Windsurf');
    }
    
    throw new Error(`不支持的平台: ${platform}`);
  }
  
  /**
   * 检查 Windsurf 是否已安装
   */
  static async isInstalled() {
    try {
      const dbPath = this.getDBPath();
      await fs.access(dbPath);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * 启动 Windsurf
   */
  static async startWindsurf() {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    try {
      console.log('[启动 Windsurf] 开始启动...');
      
      if (process.platform === 'win32') {
        // Windows: 启动 Windsurf.exe
        try {
          // 方法1: 从开始菜单启动
          await execAsync('start "" "Windsurf"', { shell: 'cmd.exe' });
          console.log('[启动 Windsurf] Windows: 已从开始菜单启动');
        } catch (error) {
          // 方法2: 从常见安装路径启动
          const commonPaths = [
            '%LOCALAPPDATA%\\Programs\\Windsurf\\Windsurf.exe',
            '%PROGRAMFILES%\\Windsurf\\Windsurf.exe',
            '%PROGRAMFILES(X86)%\\Windsurf\\Windsurf.exe'
          ];
          
          let started = false;
          for (const exePath of commonPaths) {
            try {
              await execAsync(`start "" "${exePath}"`, { shell: 'cmd.exe' });
              console.log(`[启动 Windsurf] Windows: 已从 ${exePath} 启动`);
              started = true;
              break;
            } catch {
              // 继续尝试下一个路径
            }
          }
          
          if (!started) {
            throw new Error('无法找到 Windsurf 安装路径');
          }
        }
        
      } else if (process.platform === 'darwin') {
        // macOS: 使用 open 命令启动
        await execAsync('open -a Windsurf');
        console.log('[启动 Windsurf] macOS: 已启动');
        
      } else {
        throw new Error('不支持的操作系统');
      }
      
      console.log('[启动 Windsurf] ✅ 启动成功');
      return true;
    } catch (error) {
      console.error('[启动 Windsurf] 错误:', error);
      throw error;
    }
  }
  
  /**
   * 检查 Windsurf 是否正在运行
   */
  static async isRunning() {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq Windsurf.exe"', { shell: 'cmd.exe' });
        return stdout.toLowerCase().includes('windsurf.exe');
      } else if (process.platform === 'darwin') {
        try {
          // 使用更宽松的匹配，检测任何 Windsurf 相关进程
          const { stdout } = await execAsync('pgrep -f "Windsurf"');
          return stdout.trim().length > 0;
        } catch {
          // pgrep 返回非0表示没找到进程
          return false;
        }
      } else {
        return false;
      }
    } catch {
      return false;
    }
  }
  
  /**
   * 关闭 Windsurf（优雅关闭 + 强制关闭）- 兼容所有 Windows 和 macOS 版本
   */
  static async closeWindsurf() {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    try {
      console.log('[关闭 Windsurf] 开始关闭流程...');
      
      if (process.platform === 'win32') {
        // Windows: 先尝试优雅关闭，再强制关闭
        console.log('[关闭 Windsurf] Windows: 尝试优雅关闭...');
        try {
          await execAsync('taskkill /IM Windsurf.exe 2>nul', { shell: 'cmd.exe' });
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          // 忽略错误
        }
        
        // 检查是否还在运行
        if (await this.isRunning()) {
          console.log('[关闭 Windsurf] Windows: 优雅关闭失败，使用强制关闭...');
          const commands = [
            'taskkill /F /T /IM Windsurf.exe 2>nul || exit 0',
            'taskkill /F /T /IM "Windsurf Helper.exe" 2>nul || exit 0'
          ];
          
          for (const cmd of commands) {
            try {
              await execAsync(cmd, { shell: 'cmd.exe' });
            } catch (error) {
              // 忽略错误
            }
          }
        }
        
      } else if (process.platform === 'darwin') {
        // macOS: 先尝试优雅关闭，再强制关闭
        console.log('[关闭 Windsurf] macOS: 尝试优雅关闭...');
        
        // 方法1: 使用 osascript 优雅退出
        try {
          await execAsync('osascript -e \'tell application "Windsurf" to quit\' 2>/dev/null');
          console.log('[关闭 Windsurf] macOS: 已发送退出信号');
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
          console.log('[关闭 Windsurf] macOS: osascript 失败，尝试其他方法');
        }
        
        // 检查是否还在运行
        if (await this.isRunning()) {
          console.log('[关闭 Windsurf] macOS: 优雅关闭失败，使用 SIGTERM...');
          // 方法2: 使用 SIGTERM (15) 信号
          try {
            await execAsync('pkill -15 -f "Windsurf.app/Contents/MacOS/Windsurf" 2>/dev/null');
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (error) {
            // 忽略错误
          }
        }
        
        // 最后检查，如果还在运行才使用 SIGKILL
        if (await this.isRunning()) {
          console.log('[关闭 Windsurf] macOS: SIGTERM 失败，使用 SIGKILL...');
          const commands = [
            'pkill -9 -f "Windsurf.app/Contents/MacOS/Windsurf" 2>/dev/null || true',
            'pkill -9 -f "Windsurf Helper" 2>/dev/null || true',
            'killall -9 "Windsurf" 2>/dev/null || true'
          ];
          
          for (const cmd of commands) {
            try {
              await execAsync(cmd);
            } catch (error) {
              // 忽略错误
            }
          }
        }
      }
      
      // 等待进程完全关闭
      console.log('[关闭 Windsurf] 等待进程关闭...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 重试检测（最多3次）
      const maxRetries = 3;
      for (let i = 0; i < maxRetries; i++) {
        const stillRunning = await this.isRunning();
        if (!stillRunning) {
          console.log('[关闭 Windsurf] ✅ 确认已关闭');
          return true;
        }
        console.log(`[关闭 Windsurf] 等待中... (${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // 最后检查一次
      const stillRunning = await this.isRunning();
      if (stillRunning) {
        console.warn('[关闭 Windsurf] ⚠️ 进程可能仍在运行，但继续执行');
        // 不抛出错误，允许继续
      }
      
      console.log('[关闭 Windsurf] ✅ 关闭流程完成');
      return true;
    } catch (error) {
      console.error('[关闭 Windsurf] 错误:', error);
      throw error;
    }
  }
}

/**
 * 账号切换器
 */
class AccountSwitcher {
  /**
   * 使用 refresh_token 获取 access_token（通过 Cloudflare Workers 中转）
   */
  static async getAccessToken(refreshToken) {
    const axios = require('axios');
    const FIREBASE_API_KEY = 'AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY';
    
    const formData = new URLSearchParams();
    formData.append('grant_type', 'refresh_token');
    formData.append('refresh_token', refreshToken);
    
    // 使用 Cloudflare Workers 中转（国内可访问）
    const WORKER_URL = 'https://windsurf.crispvibe.cn';
    
    try {
      const response = await axios.post(
        `${WORKER_URL}/token?key=${FIREBASE_API_KEY}`,
        formData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }
      );
      
      return response.data.id_token;
    } catch (error) {
      // 打印详细错误信息
      if (error.response) {
        console.error('Workers 返回错误:', error.response.data);
        throw new Error(`Workers 错误: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
  
  /**
   * 使用 access_token 获取 api_key
   */
  static async getApiKey(accessToken) {
    const axios = require('axios');
    
    const response = await axios.post(
      'https://register.windsurf.com/exa.seat_management_pb.SeatManagementService/RegisterUser',
      {
        firebase_id_token: accessToken
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );
    
    return {
      apiKey: response.data.api_key,
      name: response.data.name,
      apiServerUrl: response.data.api_server_url
    };
  }
  
  /**
   * 加密 sessions 数据
   */
  static encryptSessions(sessionsData) {
    // 设置 userData 路径与 Windsurf 一致，确保加密同源
    const windsurfUserData = WindsurfPathDetector.getUserDataPath();
    const originalUserData = app.getPath('userData');
    
    try {
      // 临时设置为 Windsurf 的 userData (关键：确保加密同源)
      app.setPath('userData', windsurfUserData);
      
      const jsonString = JSON.stringify(sessionsData);
      const encrypted = safeStorage.encryptString(jsonString);
      
      console.log('[加密] ✅ 加密成功，userData:', windsurfUserData);
      return encrypted;
    } finally {
      // 恢复原始 userData
      app.setPath('userData', originalUserData);
    }
  }
  
  /**
   * 写入数据库（使用 sql.js - 唯一可靠的方案）
   */
  static async writeToDB(key, value) {
    const initSqlJs = require('sql.js');
    const dbPath = WindsurfPathDetector.getDBPath();
    
    try {
      // 检查值是否为 null 或 undefined
      if (value === null || value === undefined) {
        console.error(`❌ 尝试写入 null/undefined 值到 key: ${key}`);
        throw new Error(`Cannot write null/undefined value to key: ${key}`);
      }
      
      // 读取数据库文件
      const dbBuffer = await fs.readFile(dbPath);
      
      // 初始化 sql.js
      const SQL = await initSqlJs();
      const db = new SQL.Database(dbBuffer);
      
      try {
        let finalValue;
        
        // 处理不同类型的值
        if (Buffer.isBuffer(value)) {
          // Buffer 需要转为 JSON 格式的字符串（Windsurf 的存储格式）
          finalValue = JSON.stringify({
            type: 'Buffer',
            data: Array.from(value)
          });
        } else if (typeof value === 'object') {
          // 普通对象转为 JSON 字符串
          finalValue = JSON.stringify(value);
          // 验证 JSON 字符串不是 "null"
          if (finalValue === 'null') {
            console.error(`❌ JSON.stringify 返回 "null" for key: ${key}`, value);
            throw new Error(`JSON.stringify returned "null" for key: ${key}`);
          }
        } else {
          // 字符串直接使用
          finalValue = value;
        }
        
        // 执行插入或更新
        db.run('INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)', [key, finalValue]);
        
        // 导出数据库
        const data = db.export();
        
        // 写回文件
        await fs.writeFile(dbPath, data);
        
        console.log(`✅ 已写入数据库 (sql.js): ${key}`);
        return true;
      } finally {
        db.close();
      }
    } catch (error) {
      console.error(`❌ sql.js 写入失败:`, error);
      throw error;
    }
  }
  
  /**
   * 备份数据库
   */
  static async backupDB() {
    const dbPath = WindsurfPathDetector.getDBPath();
    const backupPath = dbPath + '.backup.' + Date.now();
    
    try {
      await fs.copyFile(dbPath, backupPath);
      console.log('数据库已备份:', backupPath);
    } catch (error) {
      console.warn('备份数据库失败:', error.message);
    }
  }
  
  /**
   * 重置机器 ID
   */
  static async resetMachineId() {
    const { v4: uuidv4 } = require('uuid');
    const crypto = require('crypto');
    const storageJsonPath = path.join(process.env.HOME, 'Library/Application Support/Windsurf/User/globalStorage/storage.json');
    
    try {
      // 生成新的机器 ID
      const newMachineId = crypto.createHash('sha256').update(uuidv4()).digest('hex');
      const newSqmId = `{${uuidv4()}}`;
      const newDevDeviceId = uuidv4();
      
      // 读取 storage.json
      const storageData = JSON.parse(await fs.readFile(storageJsonPath, 'utf-8'));
      
      // 更新机器 ID
      storageData.machineId = newMachineId;
      storageData.sqmId = newSqmId;
      storageData.devDeviceId = newDevDeviceId;
      
      // 写回文件
      await fs.writeFile(storageJsonPath, JSON.stringify(storageData, null, 2));
      
      return { newMachineId, newSqmId, newDevDeviceId };
    } catch (error) {
      throw new Error(`重置机器 ID 失败: ${error.message}`);
    }
  }
  
  /**
   * 切换账号（主函数）
   * @param {Object} account - 账号信息
   * @param {Function} logCallback - 日志回调函数
   * @param {Boolean} skipClose - 是否跳过关闭 Windsurf（直接写入）
   */
  static async switchAccount(account, logCallback = null, skipClose = false) {
    const log = (msg) => {
      console.log(msg);
      if (logCallback) logCallback(msg);
    };
    
    try {
      log('[切号] ========== 开始切换账号 ==========');
      log(`[切号] 目标账号: ${account.email}`);
      
      // ========== 步骤 1: 检查并关闭 Windsurf ==========
      if (skipClose) {
        log('[切号] ========== 步骤 1: 跳过关闭 Windsurf（直接写入模式）==========');
        log('[切号] ⚠️  将在 Windsurf 运行时直接写入数据');
      } else {
        log('[切号] ========== 步骤 1: 检查并关闭 Windsurf ==========');
        
        const isInstalled = await WindsurfPathDetector.isInstalled();
        if (!isInstalled) {
          throw new Error('未检测到 Windsurf，请确保已安装');
        }
        log('[切号] ✅ Windsurf 已安装');
        
        const isRunning = await WindsurfPathDetector.isRunning();
        if (isRunning) {
          log('[切号] 正在关闭 Windsurf...');
          await WindsurfPathDetector.closeWindsurf();
          
          // 等待进程完全关闭
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const stillRunning = await WindsurfPathDetector.isRunning();
          if (stillRunning) {
            throw new Error('Windsurf 进程未能关闭，请手动关闭后重试');
          }
          log('[切号] ✅ Windsurf 已关闭');
        } else {
          log('[切号] ✅ Windsurf 未运行');
        }
      }
      
      // ========== 步骤 2: 重置机器 ID ==========
      log('[切号] ========== 步骤 2: 重置机器 ID ==========');
      
      const { newMachineId, newSqmId, newDevDeviceId } = await this.resetMachineId();
      log(`[切号] ✅ 机器 ID 已重置`);
      log(`[切号]    machineId: ${newMachineId.substring(0, 16)}...`);
      log(`[切号]    sqmId: ${newSqmId}`);
      log(`[切号]    devDeviceId: ${newDevDeviceId}`);
      
      // ========== 步骤 3: 获取账号凭证 ==========
      log('[切号] ========== 步骤 3: 获取账号凭证 ==========');
      
      let apiKey, name, apiServerUrl;
      
      // 优先使用账号文件中已有的数据
      if (account.apiKey && account.name && account.apiServerUrl) {
        log('[切号] 使用账号文件中已有的凭证数据...');
        apiKey = account.apiKey;
        name = account.name;
        apiServerUrl = account.apiServerUrl;
        log(`[切号] ✅ 使用已有数据`);
        log(`[切号]    用户名: ${name}`);
        log(`[切号]    API Key: ${apiKey.substring(0, 20)}...`);
        log(`[切号]    Server URL: ${apiServerUrl}`);
      } else {
        // 如果账号文件中没有，则通过 API 获取
        if (!account.refreshToken) {
          throw new Error('账号缺少 refreshToken 和 apiKey，无法切换');
        }
        
        log('[切号] 账号文件中缺少凭证数据，通过 API 获取...');
        log('[切号] 正在获取 access_token...');
        const accessToken = await this.getAccessToken(account.refreshToken);
        log('[切号] ✅ 获取 access_token 成功');
        
        log('[切号] 正在获取 api_key...');
        const apiKeyInfo = await this.getApiKey(accessToken);
        apiKey = apiKeyInfo.apiKey;
        name = apiKeyInfo.name;
        apiServerUrl = apiKeyInfo.apiServerUrl;
        log('[切号] ✅ 获取 api_key 成功');
        log(`[切号]    用户名: ${name}`);
        log(`[切号]    API Key: ${apiKey.substring(0, 20)}...`);
        log(`[切号]    Server URL: ${apiServerUrl}`);
        
        // 保存到账号文件，以便下次直接使用
        log('[切号] 保存凭证数据到账号文件...');
        try {
          const { app } = require('electron');
          const accountsFilePath = path.join(app.getPath('userData'), 'accounts.json');
          let accounts = [];
          try {
            const data = await fs.readFile(accountsFilePath, 'utf-8');
            accounts = JSON.parse(data);
          } catch (e) {
            log('[切号] ⚠️ 读取账号文件失败，跳过保存');
          }
          
          const accountIndex = accounts.findIndex(acc => acc.id === account.id || acc.email === account.email);
          if (accountIndex !== -1) {
            accounts[accountIndex] = {
              ...accounts[accountIndex],
              apiKey,
              name,
              apiServerUrl,
              updatedAt: new Date().toISOString()
            };
            await fs.writeFile(accountsFilePath, JSON.stringify(accounts, null, 2), { encoding: 'utf-8' });
            log('[切号] ✅ 凭证数据已保存到账号文件');
          }
        } catch (e) {
          log(`[切号] ⚠️ 保存凭证数据失败: ${e.message}`);
        }
      }
      
      // ========== 步骤 4: 重置机器码 ==========
      log('[切号] ========== 步骤 4: 重置机器码 ==========');
      
      // 4.1 关闭 Windsurf 并重置机器码
      log('[切号] 正在关闭 Windsurf 并重置机器码...');
      const { fullResetWindsurf } = require('../src/machineIdResetter');
      
      try {
        const resetResult = await fullResetWindsurf();
        if (resetResult.success) {
          log('[切号] ✅ 机器码重置成功');
          log(`[切号]    主机器ID: ${resetResult.machineIds.mainMachineId}`);
          log(`[切号]    遥测ID: ${resetResult.machineIds.telemetryMachineId.substring(0, 16)}...`);
          log(`[切号]    SQM ID: ${resetResult.machineIds.sqmId}`);
          log(`[切号]    开发设备ID: ${resetResult.machineIds.devDeviceId}`);
          log(`[切号]    服务ID: ${resetResult.machineIds.serviceMachineId}`);
        } else {
          log(`[切号] ⚠️ 机器码重置失败: ${resetResult.error}`);
          log('[切号] 继续执行账号切换...');
        }
      } catch (error) {
        log(`[切号] ⚠️ 机器码重置出错: ${error.message}`);
        log('[切号] 继续执行账号切换...');
      }
      
      // 等待一下确保文件系统操作完成
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // ========== 步骤 5: 写入数据库 ==========
      log('[切号] ========== 步骤 5: 写入数据库 ==========');
      
      // 5.1 删除旧账号数据
      log('[切号] 清理旧账号数据...');
      const initSqlJs = require('sql.js');
      const dbPath = WindsurfPathDetector.getDBPath();
      let dbBuffer = await fs.readFile(dbPath);
      let SQL = await initSqlJs();
      let db = new SQL.Database(dbBuffer);
      
      const oldKeysResult = db.exec(`SELECT key FROM ItemTable WHERE key LIKE 'windsurf_auth-%'`);
      if (oldKeysResult.length > 0 && oldKeysResult[0].values.length > 0) {
        for (const row of oldKeysResult[0].values) {
          db.run('DELETE FROM ItemTable WHERE key = ?', [row[0]]);
        }
        const data = db.export();
        await fs.writeFile(dbPath, data);
        log(`[切号] ✅ 已删除 ${oldKeysResult[0].values.length} 个旧账号 key`);
      }
      db.close();
      
      // 5.2 构建 sessions 数据（直接创建新的，不需要解密修改）
      log('[切号] 构建 sessions 数据...');
      const sessionsKey = 'secret://{"extensionId":"codeium.windsurf","key":"windsurf_auth.sessions"}';
      
      const sessionId = uuidv4();
      const sessionsData = [{
        id: sessionId,
        accessToken: apiKey,
        account: { label: name, id: name },
        scopes: []
      }];
      
      log('[切号] Sessions 数据结构:');
      log(`[切号]    id: ${sessionId}`);
      log(`[切号]    accessToken: ${apiKey}`);
      log(`[切号]    account.label: ${name}`);
      log(`[切号]    account.id: ${name}`);
      log(`[切号]    scopes: []`);
      
      // 加密 sessions 数据
      log('[切号] 加密 sessions 数据...');
      const encrypted = this.encryptSessions(sessionsData);
      
      // 验证加密结果
      if (!encrypted || !Buffer.isBuffer(encrypted)) {
        throw new Error('Sessions 数据加密失败：返回的不是 Buffer');
      }
      if (encrypted.length === 0) {
        throw new Error('Sessions 数据加密失败：Buffer 长度为 0');
      }
      
      log(`[切号] 加密后 Buffer 长度: ${encrypted.length} 字节`);
      log(`[切号] 前 20 字节: [${Array.from(encrypted.slice(0, 20)).join(', ')}]`);
      
      // 5.3 写入所有必需数据
      log('[切号] 写入账号数据...');
      log(`[切号] 写入 key: ${sessionsKey}`);
      await this.writeToDB(sessionsKey, encrypted);
      
      // 立即验证写入
      const verifySessionsBuffer = await fs.readFile(dbPath);
      const verifySessionsSQL = await initSqlJs();
      const verifySessionsDb = new verifySessionsSQL.Database(verifySessionsBuffer);
      const verifySessionsResult1 = verifySessionsDb.exec('SELECT value FROM ItemTable WHERE key = ?', [sessionsKey]);
      verifySessionsDb.close();
      
      if (verifySessionsResult1.length > 0 && verifySessionsResult1[0].values.length > 0) {
        log('[切号] ✅ Sessions 写入成功并已验证');
      } else {
        throw new Error('Sessions 写入后验证失败：数据库中未找到数据');
      }
      
      const teamId = uuidv4();
      const authStatus = {
        name, apiKey, email: account.email,
        teamId, planName: "Pro"
      };
      log('[切号] 写入 windsurfAuthStatus:');
      log(`[切号]    name: ${name}`);
      log(`[切号]    apiKey: ${apiKey}`);
      log(`[切号]    email: ${account.email}`);
      log(`[切号]    teamId: ${teamId}`);
      log(`[切号]    planName: Pro`);
      await this.writeToDB('windsurfAuthStatus', authStatus);
      
      // 立即验证写入
      const verifyAuthBuffer = await fs.readFile(dbPath);
      const verifyAuthSQL = await initSqlJs();
      const verifyAuthDb = new verifyAuthSQL.Database(verifyAuthBuffer);
      const verifyAuthResult1 = verifyAuthDb.exec('SELECT value FROM ItemTable WHERE key = ?', ['windsurfAuthStatus']);
      verifyAuthDb.close();
      
      if (verifyAuthResult1.length > 0 && verifyAuthResult1[0].values.length > 0) {
        const verifyAuthValue = verifyAuthResult1[0].values[0][0];
        if (verifyAuthValue === 'null' || verifyAuthValue === null) {
          throw new Error('windsurfAuthStatus 写入后验证失败：值为 null');
        }
        try {
          const parsed = JSON.parse(verifyAuthValue);
          if (!parsed || !parsed.email) {
            throw new Error('windsurfAuthStatus 写入后验证失败：解析后数据无效');
          }
          log(`[切号] ✅ windsurfAuthStatus 写入成功并已验证: ${parsed.email}`);
        } catch (e) {
          throw new Error(`windsurfAuthStatus 写入后验证失败：JSON 解析错误 - ${e.message}`);
        }
      } else {
        throw new Error('windsurfAuthStatus 写入后验证失败：数据库中未找到数据');
      }
      
      const installationId = uuidv4();
      const codeiumConfig = {
        "codeium.installationId": installationId,
        "apiServerUrl": apiServerUrl || "https://server.self-serve.windsurf.com",
        "codeium.hasOneTimeUpdatedUnspecifiedMode": true
      };
      log('[切号] 写入 codeium.windsurf:');
      log(`[切号]    installationId: ${installationId}`);
      log(`[切号]    apiServerUrl: ${codeiumConfig.apiServerUrl}`);
      await this.writeToDB('codeium.windsurf', codeiumConfig);
      log('[切号] ✅ codeium.windsurf 写入成功');
      
      log(`[切号] 写入 codeium.windsurf-windsurf_auth: ${name}`);
      await this.writeToDB('codeium.windsurf-windsurf_auth', name);
      log('[切号] ✅ codeium.windsurf-windsurf_auth 写入成功');
      
      log('[切号] ✅ 所有数据写入完成');
      
      // 5.4 等待文件系统同步
      log('[切号] 等待文件系统同步...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      log('[切号] ✅ 数据同步完成');
      
      // 5.5 验证数据写入
      log('[切号] ========== 验证数据写入 ==========');
      const initSqlJsVerify = require('sql.js');
      const verifyBuffer = await fs.readFile(dbPath);
      const SQLVerify = await initSqlJsVerify();
      const verifyDb = new SQLVerify.Database(verifyBuffer);
      
      // 验证 sessions
      const verifySessionsResult = verifyDb.exec('SELECT value FROM ItemTable WHERE key = ?', [sessionsKey]);
      if (verifySessionsResult.length > 0) {
        const val = verifySessionsResult[0].values[0][0];
        const parsed = JSON.parse(val);
        log(`[切号] ✅ Sessions 已验证: Buffer 长度 ${parsed.data ? parsed.data.length : 0}`);
      } else {
        log('[切号] ❌ Sessions 未找到！');
      }
      
      // 验证 windsurfAuthStatus
      const verifyAuthResult = verifyDb.exec('SELECT value FROM ItemTable WHERE key = ?', ['windsurfAuthStatus']);
      if (verifyAuthResult.length > 0) {
        const val = JSON.parse(verifyAuthResult[0].values[0][0]);
        log(`[切号] ✅ windsurfAuthStatus 已验证: ${val.email} / ${val.name}`);
      } else {
        log('[切号] ❌ windsurfAuthStatus 未找到！');
      }
      
      verifyDb.close();
      
      // ========== 步骤 5: 使用持久化机制确保数据不被覆盖 ==========
      log('[切号] ========== 步骤 5: 启用持久化保护机制 ==========');
      
      // 使用新的持久化模块
      const ConfigPersister = require('./configPersister');
      const persister = new ConfigPersister();
      
      // 准备账号数据
      const accountData = {
        email: account.email,
        name: name,
        apiKey: apiKey,
        apiServerUrl: apiServerUrl || "https://server.self-serve.windsurf.com"
      };
      
      if (skipClose) {
        // Windsurf 正在运行，使用强制写入模式
        log('[切号] Windsurf 正在运行，使用强制写入模式...');
        
        // 强制写入 5 次，确保数据生效
        const forceSuccess = await persister.forceWrite(accountData, 5, 1000);
        
        if (forceSuccess) {
          log('[切号] ✅ 强制写入成功，数据已生效');
          
          // 启动监控模式，防止被覆盖
          log('[切号] 启动监控模式，持续保护配置...');
          await persister.startMonitoring(accountData, {
            interval: 3000,     // 每 3 秒检查一次
            maxRetries: 20,     // 最多重试 20 次
            autoRecover: true   // 自动恢复
          });
          
          // 10 秒后自动停止监控
          setTimeout(() => {
            persister.stopMonitoring();
            log('[切号] 监控模式已停止');
          }, 10000);
          
          log('[切号] 💡 请刷新 Windsurf 查看登录状态');
        } else {
          log('[切号] ⚠️ 强制写入失败，请手动重启 Windsurf');
        }
      } else {
        // 正常流程：启动 Windsurf
        log('[切号] ========== 步骤 6: 启动 Windsurf ==========');
        
        log('[切号] 正在启动 Windsurf...');
        await WindsurfPathDetector.startWindsurf();
        log('[切号] ✅ Windsurf 已启动');
        
        // 等待 Windsurf 初始化
        log('[切号] 等待 Windsurf 初始化...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 使用持久化写入
        log('[切号] 开始持久化写入...');
        const writeSuccess = await persister.forceWrite(accountData, 3, 2000);
        
        if (writeSuccess) {
          log('[切号] ✅ 数据写入成功');
          
          // 启动短时监控，确保数据不被覆盖
          log('[切号] 启动短时监控...');
          await persister.startMonitoring(accountData, {
            interval: 2000,     // 每 2 秒检查一次
            maxRetries: 10,     // 最多重试 10 次
            autoRecover: true   // 自动恢复
          });
          
          // 15 秒后停止监控
          setTimeout(() => {
            persister.stopMonitoring();
            log('[切号] 监控已停止');
          }, 15000);
        } else {
          log('[切号] ⚠️ 数据写入失败，请重试');
        }
      }
      
      log('[切号] ========== 切换完成 ==========');
      log(`[切号] 账号: ${account.email}`);
      log(`[切号] 用户名: ${name}`);
      log('[切号] 💡 请等待 Windsurf 完全加载后查看登录状态');
      
      return {
        success: true,
        email: account.email,
        name: name,
        apiKey: apiKey
      };
      
    } catch (error) {
      log(`[切号] ❌ 切换失败: ${error.message}`);
      console.error('[切号] 错误详情:', error);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 获取当前登录的账号信息（使用 sql.js）
   */
  static async getCurrentAccount() {
    const initSqlJs = require('sql.js');
    const dbPath = WindsurfPathDetector.getDBPath();
    
    try {
      const dbBuffer = await fs.readFile(dbPath);
      const SQL = await initSqlJs();
      const db = new SQL.Database(dbBuffer);
      
      try {
        const result = db.exec('SELECT value FROM ItemTable WHERE key = ?', ['windsurfAuthStatus']);
        
        if (result.length > 0 && result[0].values.length > 0) {
          const value = result[0].values[0][0];
          return JSON.parse(value);
        }
        
        return null;
      } finally {
        db.close();
      }
    } catch (error) {
      console.error('sql.js 获取账号失败:', error);
      return null;
    }
  }
}

// 导出模块
module.exports = {
  WindsurfPathDetector,
  AccountSwitcher
};

// 全局函数（供 HTML 调用）
if (typeof window !== 'undefined') {
  window.WindsurfPathDetector = WindsurfPathDetector;
  window.AccountSwitcher = AccountSwitcher;
}

/**
 * 切换到指定账号（全局函数）- 带实时日志显示
 */
async function switchToAccount(accountId) {
  try {
    // 获取所有账号
    const accountsResult = await window.ipcRenderer.invoke('get-accounts');
    if (!accountsResult.success || !accountsResult.accounts) {
      alert('获取账号列表失败');
      return;
    }
    
    const account = accountsResult.accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      alert('账号不存在');
      return;
    }
    
    // 创建日志显示模态框
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.zIndex = '10000';
    modal.innerHTML = `
      <div class="modal-dialog modern-modal" style="max-width: 550px;" onclick="event.stopPropagation()">
        <div class="modern-modal-header">
          <div class="modal-title-row">
            <i data-lucide="refresh-cw" style="width: 24px; height: 24px; color: #007aff;"></i>
            <h3 class="modal-title">切换账号</h3>
          </div>
          <button class="modal-close-btn" id="closeSwitchModal" title="关闭" style="display: none;">
            <i data-lucide="x" style="width: 20px; height: 20px;"></i>
          </button>
        </div>
        
        <div class="modern-modal-body">
          <div style="background: #f5f5f7; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <div style="font-size: 13px; color: #86868b; margin-bottom: 4px;">目标账号</div>
            <div style="font-size: 15px; font-weight: 600; color: #1d1d1f;">${account.email}</div>
          </div>
          
          <div style="background: #1d1d1f; border-radius: 8px; padding: 12px; height: 240px; overflow-y: auto; font-family: 'Monaco', 'Menlo', monospace; font-size: 11px; line-height: 1.5;" id="switchLogContainer">
            <div style="color: #34c759;">🚀 准备切换账号...</div>
          </div>
        </div>
        
        <div class="modern-modal-footer" id="switchFooter">
          <div style="flex: 1; text-align: left; color: #86868b; font-size: 13px;" id="switchStatus">
            正在处理...
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // 初始化图标
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    
    const logContainer = document.getElementById('switchLogContainer');
    const statusEl = document.getElementById('switchStatus');
    const closeBtn = document.getElementById('closeSwitchModal');
    
    // 添加日志函数
    function addLog(message) {
      // 解析日志类型
      let color = '#ffffff';
      if (message.includes('✅') || message.includes('成功')) {
        color = '#34c759';
      } else if (message.includes('❌') || message.includes('失败') || message.includes('错误')) {
        color = '#ff3b30';
      } else if (message.includes('⚠️') || message.includes('警告')) {
        color = '#ff9500';
      } else if (message.includes('==========')) {
        color = '#007aff';
      }
      
      const log = document.createElement('div');
      log.style.color = color;
      log.textContent = message;
      logContainer.appendChild(log);
      logContainer.scrollTop = logContainer.scrollHeight;
      
      // 更新状态
      if (message.includes('切换完成')) {
        statusEl.textContent = '✅ 切换成功';
        statusEl.style.color = '#34c759';
        closeBtn.style.display = 'block';
      } else if (message.includes('切换失败')) {
        statusEl.textContent = '❌ 切换失败';
        statusEl.style.color = '#ff3b30';
        closeBtn.style.display = 'block';
      }
    }
    
    // 监听实时日志
    const logListener = (event, log) => {
      addLog(log);
    };
    window.ipcRenderer.on('switch-log', logListener);
    
    try {
      // 检查 Windsurf 是否正在运行
      const isRunning = await window.ipcRenderer.invoke('check-windsurf-running');
      const skipClose = isRunning; // 如果正在运行，跳过关闭
      
      if (skipClose) {
        addLog('⚠️ 检测到 Windsurf 正在运行，将直接写入数据（不关闭）');
        addLog('💡 这可能会更快，但需要刷新 Windsurf 才能看到效果');
      }
      
      // 执行切换（通过 IPC 调用）
      const result = await window.ipcRenderer.invoke('switch-account', account, skipClose);
      
      if (!result.success) {
        addLog(`❌ 切换失败: ${result.error}`);
        statusEl.textContent = '❌ 切换失败';
        statusEl.color = '#ff3b30';
      }
      
    } catch (error) {
      console.error('切换账号失败:', error);
      addLog(`❌ 发生错误: ${error.message}`);
      statusEl.textContent = '❌ 发生错误';
      statusEl.style.color = '#ff3b30';
    } finally {
      // 移除日志监听器
      window.ipcRenderer.removeListener('switch-log', logListener);
      closeBtn.style.display = 'block';
    }
    
    // 关闭按钮
    closeBtn.onclick = () => {
      window.ipcRenderer.removeListener('switch-log', logListener);
      modal.remove();
    };
    
    // 点击背景关闭
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    };
    
  } catch (error) {
    console.error('切换账号失败:', error);
    alert(`切换失败: ${error.message}`);
  }
}

/**
 * 获取当前 Windsurf 登录的账号
 */
async function getCurrentWindsurfAccount() {
  try {
    const account = await window.ipcRenderer.invoke('get-current-windsurf-account');
    
    if (account) {
      console.log('当前 Windsurf 账号:', account);
      return account;
    } else {
      console.log('Windsurf 未登录');
      return null;
    }
  } catch (error) {
    console.error('获取当前账号失败:', error);
    return null;
  }
}

// 确保 switchToAccount 函数在全局作用域可用
if (typeof window !== 'undefined') {
  window.switchToAccount = switchToAccount;
  window.getCurrentWindsurfAccount = getCurrentWindsurfAccount;
  console.log('✅ accountSwitcher.js: switchToAccount 函数已注册到全局作用域');
}

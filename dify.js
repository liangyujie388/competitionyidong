// dify.js - 纯前端调用自部署 Dify 工作流

// ========== 配置区域（请根据你的实际情况修改） ==========
const DIFY_API_URL = 'http://10.135.68.250:5001';   // 你的自部署 Dify API 地址
const DIFY_API_KEY = 'app-8Tf20Ir34izqzR2haPtcRCnU';                  // 你的应用 API Key（⚠️ 仅限内网测试）
// ====================================================

/**
 * 上传文件到 Dify（仅支持图片等）
 * @param {File} file - 文件对象
 * @returns {Promise<string>} 文件 ID
 */
async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('user', 'web_user');

    const res = await fetch(`${DIFY_API_URL}/v1/files/upload`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${DIFY_API_KEY}`
        },
        body: formData
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`文件上传失败: ${res.status} ${errText}`);
    }
    const data = await res.json();
    return data.id;   // 返回文件 ID
}

/**
 * 调用 Dify 工作流
 * @param {string} text - 用户消息
 * @param {Array<File>} files - 文件数组（可选）
 * @param {string} moneySent - 涉及金额（可选）
 * @returns {Promise<string>} 工作流返回的答案
 */
export async function callDifyWorkflow(text, files = [], moneySent = '未说明') {
    // 1. 上传文件，收集 file_ids
    const fileIds = [];
    for (const file of files) {
        try {
            const fid = await uploadFile(file);
            fileIds.push({
                type: 'image',
                transfer_method: 'local_file',
                upload_file_id: fid
            });
        } catch (e) {
            console.warn('上传文件失败，跳过', e);
        }
    }

    // 2. 构造工作流请求体（根据你的工作流输入变量名调整）
    const payload = {
        inputs: {
            text: text,
            money_sent: moneySent,
            file_ids: fileIds
        },
        response_mode: 'blocking',
        user: 'web_user'
    };

    const res = await fetch(`${DIFY_API_URL}/v1/workflows/run`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${DIFY_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`工作流调用失败: ${res.status} ${errText}`);
    }

    const result = await res.json();
    // 根据工作流实际输出字段调整（常见为 answer 或 text）
    const answer = result?.data?.outputs?.answer || result?.answer;
    if (!answer) {
        throw new Error('工作流返回结果中没有有效 answer 字段');
    }
    return answer;
}
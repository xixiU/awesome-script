// ==UserScript==
// @name         微博自动刷评论脚本
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  自动搜索关键词并刷评论，自动翻页
// @author       xixiU
// @match        https://s.weibo.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    /** 配置区域 **/
    const COMMENT_TEXT = "测试"; // 评论内容
    const COMMENT_INTERVAL = 5000; // 评论间隔时间，单位为毫秒

    /** 工具函数 **/
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getCommentedIds() {
        return GM_getValue('commented_ids', []);
    }

    function saveCommentedId(id) {
        const commentedIds = getCommentedIds();
        commentedIds.push(id);
        GM_setValue('commented_ids', commentedIds);
    }

    function isAlreadyCommented(id) {
        const commentedIds = getCommentedIds();
        return commentedIds.includes(id);
    }

    /** 点击评论按钮并提交评论 **/
    async function commentOnWeibo(item) {
        const weiboId = item.getAttribute('mid'); // 微博唯一 ID

        if (!weiboId || isAlreadyCommented(weiboId)) {
            return;
        }

        // 选择第二个按钮（评论按钮）
        const commentButtons = item.querySelectorAll('.card-act .woo-box-flex.woo-box-alignCenter.woo-box-justifyCenter');
        if (commentButtons.length < 3) {
            return
        }
        const commentButton = commentButtons[2]; // 第二个按钮是评论按钮

        if (commentButton) {
            commentButton.click();

            await sleep(2000); // 等待评论框弹出

            const commentBox = item.querySelector('div.input textarea[node-type="textEl"]'); // 定位评论框
            const submitButton = item.querySelector('div.input + div a[action-type="post"'); // 提交按钮定位

            if (commentBox && submitButton) {
                commentBox.value = COMMENT_TEXT;

                // 触发 input 事件，确保输入内容生效
                commentBox.dispatchEvent(new Event('input', { bubbles: true }));

                submitButton.click();

                console.log(`评论成功: ${weiboId},评论内容:${COMMENT_TEXT}`);
                saveCommentedId(weiboId);
            } else {
                console.log(`未找到评论框或提交按钮，跳过: ${weiboId}`);
            }

            await sleep(COMMENT_INTERVAL); // 控制评论间隔
        }
    }

    /** 自动翻页并评论 **/
    async function autoComment() {
        let page = 1;
        while (true) {

            const weiboItems = document.querySelectorAll('.card-wrap');
            for (let item of weiboItems) {
                await commentOnWeibo(item);
            }

            // 翻页逻辑
            const nextPageButton = document.querySelector('a.next'); // 下一页按钮
            if (nextPageButton) {
                console.log('翻到下一页...');
                nextPageButton.click();
                await sleep(5000); // 等待新页面加载
                page++;
            } else {
                console.log('已到达最后一页，脚本结束。');
                break;
            }
        }
    }

    // 启动脚本
    autoComment();
})();

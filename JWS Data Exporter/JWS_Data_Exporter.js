// ==UserScript==
// @name         JWS Data Exporter
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  导出查询结果为CSV或Excel文件
// @author       rongjie.Yuan
// @match        https://jws.jiduprod.com/*
// @downloadURL  https://jidudev.com/rongjie-awesome/awesome-script/-/blob/master/JWS%20Data%20Exporter/JWS%20Data%20Exporter-1.2.user.js
// @updateURL    https://jidudev.com/rongjie-awesome/awesome-script/-/blob/master/JWS%20Data%20Exporter/JWS%20Data%20Exporter-1.2.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const exportButton = document.createElement('button');
    exportButton.innerText = '导出数据';
    exportButton.style.display = 'block';

    // 导出按钮点击事件
    exportButton.addEventListener('click', () => {
        const dataArea = document.querySelector('div.r-table-content table');
        if (!dataArea) {
            alert('请先执行SQL'); // 数据部分为空时提示
            return;
        }

        const csvContent = [];
        // 获取表头
        const headers = Array.from(dataArea.querySelector('thead.r-table-thead').querySelectorAll('th'))
        .map(th => th.getAttribute('title') || th.innerText);
        csvContent.push(headers.join(','));

        // 获取数据行
        const rows = dataArea.querySelectorAll('tbody tr.r-table-row.r-table-row-level-0');
        if (rows.length === 0) {
            alert('没有数据需要导出'); // 数据部分为空时提示
            return;
        }

        rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td')).map(td => td.getAttribute('title') || td.innerText);
            csvContent.push(cells.join(','));
        });

        // 创建选择格式的自定义对话框
        showFormatSelectionDialog(csvContent);
    });

    function showFormatSelectionDialog(content) {
        const dialog = document.createElement('div');
        dialog.style.position = 'fixed';
        dialog.style.top = '50%';
        dialog.style.left = '50%';
        dialog.style.transform = 'translate(-50%, -50%)';
        dialog.style.padding = '20px';
        dialog.style.backgroundColor = '#fff';
        dialog.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
        dialog.style.zIndex = '1000';

        const title = document.createElement('h3');
        title.innerText = '请选择导出格式：';
        dialog.appendChild(title);

        const csvButton = document.createElement('button');
        csvButton.innerText = 'CSV';
        csvButton.onclick = () => {
            exportAsCSV(content);
            document.body.removeChild(dialog);
        };

        const excelButton = document.createElement('button');
        excelButton.innerText = 'Excel';
        excelButton.onclick = () => {
            exportAsExcel(content);
            document.body.removeChild(dialog);
        };

        dialog.appendChild(csvButton);
        dialog.appendChild(excelButton);
        document.body.appendChild(dialog);
    }

    // 观察DOM变化
    const observer = new MutationObserver((mutations) => {
        const runButton = document.querySelector('button.r-btn.r-btn-text._action-button_178z2_1');
        if (runButton) {
            const actionBar = document.querySelector('div._action-bar_k507v_1');
            actionBar.appendChild(exportButton);
            observer.disconnect(); // 找到后停止观察
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    function exportAsCSV1(content) {
        const blob = new Blob([content.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'data.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function exportAsCSV(content) {
        // 添加BOM以解决Mac上中文乱码问题
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const csvData = content.join('\n');
        const blob = new Blob([bom, csvData], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'data.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }


    function exportAsExcel(content) {
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet(content.map(row => row.split(',')));
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

        // 导出Excel文件
        XLSX.writeFile(workbook, 'data.xlsx');
    }

    // 加载XLSX库
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.0/xlsx.full.min.js';
    document.head.appendChild(script);
})();

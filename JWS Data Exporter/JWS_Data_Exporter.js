// ==UserScript==
// @name         JWS Data Exporter - Current and All Pages
// @namespace    https://jidudev.com/rongjie-awesome/awesome-script/-/blob/master/JWS%20Data%20Exporter/JWS_Data_Exporter.js
// @version      1.5
// @description  导出当前页或所有页的查询结果为CSV或Excel文件
// @author       rongjie.Yuan
// @match        https://jws.jiduprod.com/*
// @downloadURL  https://jidudev.com/rongjie-awesome/awesome-script/-/blob/master/JWS%20Data%20Exporter/JWS_Data_Exporter.js
// @updateURL    https://jidudev.com/rongjie-awesome/awesome-script/-/blob/master/JWS%20Data%20Exporter/JWS_Data_Exporter.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 创建“导出当前页”和“导出所有页”按钮
    const exportCurrentButton = document.createElement('button');
    exportCurrentButton.innerText = '导出当前页数据';
    exportCurrentButton.style.display = 'block';
    exportCurrentButton.className = 'r-btn r-btn-text _action-button_178z2_1';

    const exportAllButton = document.createElement('button');
    exportAllButton.innerText = '导出所有页数据';
    exportAllButton.style.display = 'block';
    exportAllButton.className = 'r-btn r-btn-text _action-button_178z2_1';

    // 导出当前页按钮点击事件
    exportCurrentButton.addEventListener('click', () => {
        const dataArea = document.querySelector('div.r-table-content table');
        if (!dataArea) {
            alert('请先执行SQL'); // 数据部分为空时提示
            return;
        }

        exportCurrentPageData(); // 导出当前页数据
    });


    // 在点击导出全部页按钮时显示loading
    exportAllButton.addEventListener('click', () => {
        showLoading(); // 点击“导出全部页”时显示Loading提示
        const totalPages = getTotalPages(); // 假设getTotalPages是一个函数，用于获取总页数

        let currentPage = 1;
        const allData = [];

        const dataArea = document.querySelector('div.r-table-content table');
        if (!dataArea) {
            hideLoading();//处理完后隐藏Loading提示
            alert('请先执行SQL');
            return;
        }
        const headers = Array.from(dataArea.querySelector('thead.r-table-thead').querySelectorAll('th'))
        .map(th => th.getAttribute('title') || th.innerText);
        allData.push(headers.join(','));
        function collectDataAndGoToNextPage() {
            updateProgress(currentPage, totalPages);
            const dataArea = document.querySelector('div.r-table-content table');
            if (!dataArea) {
                hideLoading();//处理完后隐藏Loading提示
                alert('请先执行SQL');
                return;
            }
            trySetPageSize();
            // 设置表头
            const rows = dataArea.querySelectorAll('tbody tr.r-table-row.r-table-row-level-0');
            rows.forEach(row => {
                const cells = Array.from(row.querySelectorAll('td')).map(td => td.getAttribute('title') || td.innerText);
                allData.push(cells.join(','));
            });

            if (currentPage < totalPages) {
                currentPage++;
                goToPage(currentPage, collectDataAndGoToNextPage);
            } else {
                hideLoading(); // 所有页处理完后隐藏Loading提示
                showFormatSelectionDialog(allData); // 显示导出格式选择对话框
            }
        }

        collectDataAndGoToNextPage();
    });

    function trySetPageSize(){
        // 如果分页存在100条/页选项，则先设置为100条/页
        // 找到包含分页选项的父容器
        const listHolder = document.querySelector(".rc-virtual-list-holder-inner");
        if (!listHolder) {
            return;
        }
        // 获取所有分页选项
        const options = listHolder.querySelectorAll(".r-select-item-option");
        // 选中最后一个选项
        options[options.length - 1].click();
        // // 重置选项的选中状态
        // options.forEach(option => {
        // option.setAttribute("aria-selected", "false");
        // option.classList.remove("r-select-item-option-active", "r-select-item-option-selected");
        // });

        
        // const lastOption = options[options.length - 1];
        // lastOption.setAttribute("aria-selected", "true");
        // lastOption.classList.add("r-select-item-option-active", "r-select-item-option-selected");
        // lastOption.click()
    }
    function exportCurrentPageData() {
        const csvContent = [];
        const dataArea = document.querySelector('div.r-table-content table');
        const headers = Array.from(dataArea.querySelector('thead.r-table-thead').querySelectorAll('th'))
        .map(th => th.getAttribute('title') || th.innerText);
        csvContent.push(headers.join(','));

        const rows = dataArea.querySelectorAll('tbody tr.r-table-row.r-table-row-level-0');
        rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td')).map(td => td.getAttribute('title') || td.innerText);
            csvContent.push(cells.join(','));
        });

        showFormatSelectionDialog(csvContent);
    }

    function getTotalPages() {
        const paginationElement = document.querySelector('.r-pagination');
        const pageItems = paginationElement ? paginationElement.querySelectorAll('.r-pagination-item') : null;
        const totalPages = pageItems ? parseInt(pageItems[pageItems.length - 1].title, 10) : 1;
        return totalPages;
    }

    // 显示Loading提示框
    function showLoading() {
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'loadingDiv';

        // 创建外框
        const spinner = document.createElement('div');
        spinner.style.position = 'absolute';
        spinner.style.width = '100px';  // 调整大小
        spinner.style.height = '100px';
        spinner.style.borderRadius = '50%';
        spinner.style.border = '8px solid rgba(0, 0, 0, 0.1)';
        spinner.style.borderTop = '8px solid #3498db'; // 蓝色旋转条
        spinner.style.animation = 'spin 1s linear infinite';

        // 文本
        const loadingText = document.createElement('div');
        loadingText.innerText = '正在导出';
        loadingText.style.color = '#fff';
        loadingText.style.fontSize = '16px';
        loadingText.style.fontWeight = 'bold';
        loadingText.style.position = 'relative';  // 保持静止，不旋转

        // 设置loadingDiv样式，整体居中
        loadingDiv.style.position = 'fixed';
        loadingDiv.style.top = '50%';
        loadingDiv.style.left = '50%';
        loadingDiv.style.transform = 'translate(-50%, -50%)';
        loadingDiv.style.width = '100px';  // 匹配外框大小
        loadingDiv.style.height = '100px';
        loadingDiv.style.display = 'flex';
        loadingDiv.style.alignItems = 'center';
        loadingDiv.style.justifyContent = 'center';
        loadingDiv.style.zIndex = '2000';

        // 将spinner和loadingText添加到loadingDiv
        loadingDiv.appendChild(spinner);  // 旋转的外框
        loadingDiv.appendChild(loadingText);  // 不旋转的文字

        document.body.appendChild(loadingDiv);

        // 添加CSS旋转动画
        const style = document.createElement('style');
        style.innerHTML = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
        document.head.appendChild(style);
    }


    // 更新进度显示
    function updateProgress(current, total) {
        const loadingDiv = document.getElementById('loadingDiv');
        if (loadingDiv) {
            loadingDiv.innerText = `正在导出 第${current}页，一共${total}页`;
        }
    }

    // 隐藏Loading提示框
    function hideLoading() {
        const loadingDiv = document.getElementById('loadingDiv');
        if (loadingDiv) {
            document.body.removeChild(loadingDiv);
        }
    }

    // 修改 goToPage 函数，确保翻页期间显示Loading效果
    function goToPage(page, callback) {
        const paginationElement = document.querySelector('.r-pagination');
        if (paginationElement) {
            const pageButton = paginationElement.querySelector(`li.r-pagination-item[title="${page}"]`);
            if (pageButton) {
                showLoading(); // 翻页前显示Loading提示

                pageButton.click();
                setTimeout(() => {
                    callback();
                    hideLoading(); // 翻页完成后隐藏Loading提示
                }, 2000); // 等待页面刷新完成
            }
        }
    }

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
        // 添加Esc取消功能
        addEscListener(dialog);
    }

    // 添加一个键盘事件监听器，用于取消导出选项
    function addEscListener(dialog) {
        function escHandler(event) {
            if (event.key === 'Escape') {
                document.body.removeChild(dialog); // 移除导出选项对话框
                document.removeEventListener('keydown', escHandler); // 移除事件监听器
            }
        }
        document.addEventListener('keydown', escHandler); // 添加键盘监听
    }

    function exportAsCSV(content) {
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
        XLSX.writeFile(workbook, 'data.xlsx');
    }

    // 观察DOM变化，添加按钮到页面
    const observer = new MutationObserver((mutations) => {
        const runButton = document.querySelector('button.r-btn.r-btn-text._action-button_178z2_1');
        if (runButton) {
            const actionBar = document.querySelector('div._action-bar_k507v_1');
            actionBar.appendChild(exportCurrentButton); // 添加“导出当前页数据”按钮
            actionBar.appendChild(exportAllButton); // 添加“导出所有页数据”按钮
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 加载XLSX库
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.0/xlsx.full.min.js';
    document.head.appendChild(script);
})();

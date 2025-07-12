// 课程列表页
function listNeedLLearn() {
    const listItems = document.querySelectorAll('.itemList .contentItem .type .ready');
    let nextVideoItem = 0;
    for (const item of listItems) {
        if (item.textContent.trim() !== '已观看') {
            nextVideoItem = nextVideoItem + 1;
        }
    }
    return nextVideoItem
}
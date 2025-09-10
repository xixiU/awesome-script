// 课程列表页
function listNeedLearn() {
    const listItems = document.querySelectorAll('.itemList .contentItem .type');
    // ready 和lleraning都是未学习的 finish是学完的
    // const listItems = document.querySelectorAll('.itemList .contentItem .type .lleraning');
    let nextVideoItem = 0;
    for (const item of listItems) {
        const className = item.querySelector('p').className
        if (className !== 'finish') {
            nextVideoItem = nextVideoItem + 1;
        }
    }
    console.log(`总共${listItems.length},已观看${listItems.length - nextVideoItem},未观看/学习中${nextVideoItem}`);
    return nextVideoItem
}
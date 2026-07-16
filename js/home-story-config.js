(function () {
    'use strict';

    window.HOME_STORY_CONFIG = Object.freeze({
        copy: Object.freeze({
            intro: Object.freeze([
                '今晚，北京中轴线正在失去颜色。',
                '城门、桥梁和街巷里的古老记忆，\n一个接一个沉睡了。',
                '只有正阳门附近，\n还闪着一点微弱的金光……',
                '铛铛车已经收到求救信号。',
                '你愿意成为中轴守护者，\n和它一起出发吗？'
            ]),
            signalButton: '接收正阳门信号',
            dialogTitle: '铛铛车：',
            dialogBody: '信号锁定！正阳桥下，\n有一位守护者正在等我们。',
            enterButton: '前往正阳门'
        }),
        timing: Object.freeze({
            character: 48,
            paragraphPause: 460,
            gateWake: 800,
            lightTravel: 1200,
            tramWake: 1150,
            bellGap: 420,
            dialogDelay: 360
        })
    });
})();

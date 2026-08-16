/*즉시 호출 함수 => 함수가 자동으로 호출
사용 이유 : 전역 변수 사용을 피하기 위해서*/
(() => {

    let yOffset = 0; // window.pageYOffset 대신 쓸 변수
    let prevScrollHeight = 0; // 현재 스크롤 위치(yOffset)보다 이전에 위치한 스크롤 섹션들의 높이값의 합
    let currentScene = 0; // 현재 활성화된(눈 앞에 보고있는) 씬(scroll-section)
    let enterNewScene = false; // 새로운 scene이 시작된 순간 true
    let acc = 0.1; // 가속도 
    let delayedYOffset = 0;
    let rafId; // requestAnimationFram Id
    let rafState; // requestAnimationFram State

    const sceneInfo = [{
        // 0
        type: 'sticky',
        heightNum: 5, // 브라우저 높이의 5배로 scrollHeight 세팅 
        scrollHeight: 0, // 씬의 전체 범위
        objs: {
            container: document.querySelector('#scroll-section-0'),
            messageA: document.querySelector('#scroll-section-0 .main-message.a'),
            messageB: document.querySelector('#scroll-section-0 .main-message.b'),
            messageC: document.querySelector('#scroll-section-0 .main-message.c'),
            messageD: document.querySelector('#scroll-section-0 .main-message.d'),
            canvas: document.querySelector('#video-canvas-0'),
            context: document.querySelector('#video-canvas-0').getContext('2d'),
            videoImages: []
        },
        values: {
            videoImageCount: 300,
            imageSequence: [0, 299],
            // 다음 section으로 넘어갈 때 처리
            canvas_opacity: [1, 0, { start: 0.9, end: 1 }],
            // 각 object마다 어떤 CSS 값을 어떤 값으로 넣을 건지 정의 (애니메이션 정보)
            messageA_opacity_in: [0, 1, { start: 0.1, end: 0.2 }],
            messageB_opacity_in: [0, 1, { start: 0.3, end: 0.4 }],
            messageC_opacity_in: [0, 1, { start: 0.5, end: 0.6 }],
            messageD_opacity_in: [0, 1, { start: 0.7, end: 0.8 }],
            messageA_translateY_in: [20, 0, { start: 0.1, end: 0.2 }],
            messageB_translateY_in: [20, 0, { start: 0.3, end: 0.4 }],
            messageC_translateY_in: [20, 0, { start: 0.5, end: 0.6 }],
            messageD_translateY_in: [20, 0, { start: 0.7, end: 0.8 }],
            messageA_opacity_out: [1, 0, { start: 0.25, end: 0.3 }],
            messageB_opacity_out: [1, 0, { start: 0.45, end: 0.5 }],
            messageC_opacity_out: [1, 0, { start: 0.65, end: 0.7 }],
            messageD_opacity_out: [1, 0, { start: 0.85, end: 0.9 }],
            messageA_translateY_out: [0, -20, { start: 0.25, end: 0.3 }],
            messageB_translateY_out: [0, -20, { start: 0.45, end: 0.5 }],
            messageC_translateY_out: [0, -20, { start: 0.65, end: 0.7 }],
            messageD_translateY_out: [0, -20, { start: 0.85, end: 0.9 }]
        }
    },
    {
        // 1
        type: 'normal',
        // heightNum: 5, // type normal에서는 필요 없음
        scrollHeight: 0,
        objs: {
            container: document.querySelector('#scroll-section-1')
        }
    },
    {
        // 2
        type: 'sticky',
        heightNum: 5,
        scrollHeight: 0,
        objs: {
            container: document.querySelector('#scroll-section-2'),
            messageA: document.querySelector('#scroll-section-2 .a'),
            messageB: document.querySelector('#scroll-section-2 .b'),
            messageC: document.querySelector('#scroll-section-2 .c'),
            pinB: document.querySelector('#scroll-section-2 .b .pin'),
            pinC: document.querySelector('#scroll-section-2 .c .pin'),
            canvas: document.querySelector('#video-canvas-1'),
            context: document.querySelector('#video-canvas-1').getContext('2d'),
            videoImages: []
        },
        values: {
            videoImageCount: 960,
            imageSequence: [0, 959],
            // 다음 section으로 넘어갈 때 처리
            canvas_opacity_in: [0, 1, { start: 0, end: 0.1 }],
            canvas_opacity_out: [1, 0, { start: 0.95, end: 1 }],
            messageA_translateY_in: [20, 0, { start: 0.15, end: 0.2 }],
            messageB_translateY_in: [30, 0, { start: 0.6, end: 0.65 }],
            messageC_translateY_in: [30, 0, { start: 0.87, end: 0.92 }],
            messageA_opacity_in: [0, 1, { start: 0.25, end: 0.3 }],
            messageB_opacity_in: [0, 1, { start: 0.6, end: 0.65 }],
            messageC_opacity_in: [0, 1, { start: 0.87, end: 0.92 }],
            messageA_translateY_out: [0, -20, { start: 0.4, end: 0.45 }],
            messageB_translateY_out: [0, -20, { start: 0.68, end: 0.73 }],
            messageC_translateY_out: [0, -20, { start: 0.95, end: 1 }],
            messageA_opacity_out: [1, 0, { start: 0.4, end: 0.45 }],
            messageB_opacity_out: [1, 0, { start: 0.68, end: 0.73 }],
            messageC_opacity_out: [1, 0, { start: 0.95, end: 1 }],
            pinB_scaleY: [0.5, 1, { start: 0.6, end: 0.65 }],
            pinC_scaleY: [0.5, 1, { start: 0.87, end: 0.92 }]
        }
    },
    {
        // 3
        type: 'sticky',
        heightNum: 5,
        scrollHeight: 0,
        objs: {
            container: document.querySelector('#scroll-section-3'),
            canvasCaption: document.querySelector('.canvas-caption'),
            canvas: document.querySelector('.image-blend-canvas'),
            context: document.querySelector('.image-blend-canvas').getContext('2d'),
            imagePath: [
                'images/blend-image-1.jpg',
                'images/blend-image-2.jpg'
            ],
            images: []
        },
        values: {
            /* 화면 크기를 예측할 수 없기 때문에 미리 값을 정할 수 가 없다. 
            -> 스크롤할 때 그 떄 바로 판단해서 계산 */
            rect1X: [0, 0, { start: 0, end: 0 }],
            rect2X: [0, 0, { start: 0, end: 0 }],
            blendHeight: [0, 0, { start: 0, end: 0 }],
            canvas_scale: [0, 0, { start: 0, end: 0 }],
            canvas_scale: [0, 0, { start: 0, end: 0 }],
            canvasCaption_opacity: [0, 1, { start: 0, end: 0 }],
            canvasCaption_translateY: [20, 0, { start: 0, end: 0 }],
            rectStartY: 0
        }
    }
    ];

    function setCanvasImages() {
        let imgElem;
        for (let i = 0; i < sceneInfo[0].values.videoImageCount; i++) {
            imgElem = new Image();
            imgElem.src = `./video/001/IMG_${6726 + i}.JPG`;
            sceneInfo[0].objs.videoImages.push(imgElem);
        }

        let imgElem2;
        for (let i = 0; i < sceneInfo[2].values.videoImageCount; i++) {
            imgElem2 = new Image();
            imgElem2.src = `./video/002/IMG_${7027 + i}.JPG`;
            sceneInfo[2].objs.videoImages.push(imgElem2);
        }

        let imgElem3;
        for (let i = 0; i < sceneInfo[3].objs.imagePath.length; i++) {
            imgElem3 = new Image();
            imgElem3.src = sceneInfo[3].objs.imagePath[i];
            sceneInfo[3].objs.images.push(imgElem3);
        }
    }

    function checkMenu() {
        // 44 : global-nav의 height
        if (yOffset > 44) {
            document.body.classList.add('local-nav-sticky');
        } else {
            document.body.classList.remove('local-nav-sticky');
        }
    }

    function setLayout() {
        // 각 스크롤 섹션의 높이 세팅
        for (let i = 0; i < sceneInfo.length; i++) {
            if (sceneInfo[i].type === 'sticky') {
                sceneInfo[i].scrollHeight = sceneInfo[i].heightNum * window.innerHeight;
            } else if (sceneInfo[i].type === 'normal') {
                sceneInfo[i].scrollHeight = sceneInfo[i].objs.container.offsetHeight;
            }
            sceneInfo[i].objs.container.style.height = `${sceneInfo[i].scrollHeight}px`;
        }

        // currentScene 자동 세팅(첫 화면과 새로 고침 할 때를 위해)
        yOffset = window.pageYOffset;
        let totalScrollHeight = 0;
        for (let i = 0; i < sceneInfo.length; i++) {
            totalScrollHeight += sceneInfo[i].scrollHeight;
            if (totalScrollHeight >= yOffset) {
                currentScene = i;
                break;
            }
        }
        document.body.setAttribute('id', `show-scene-${currentScene}`);

        /*
        canvas의 크기를 조정하는 방법
        1. canvas의 width, height 자체를 script로 조절 -> canvas가 가진 픽셀수 자체를 바꾸는 것
        -> 게임처럼 모든 화면 자체가 전부다 보이는게 좋은 경우에 사용 
        2. css transform scale 조절 ✔
        -> 성능상 더 유리, 계산할 것이 적어짐
        */
        const heightRatio = window.innerHeight / 1080;
        // translate에서의 %는, 내 자신의 크기가 기준 
        sceneInfo[0].objs.canvas.style.transform = `translate3d(-50%, -50%, 0) scale(${heightRatio})`;
        sceneInfo[2].objs.canvas.style.transform = `translate3d(-50%, -50%, 0) scale(${heightRatio})`;
    }

    function calcValues(values, currentYOffset) {
        // currentYOffset : 현재 씬에서 얼마나 스크롤 됐는지
        let rv;
        // 현재 씬(스크롤섹션)에서 스크롤된 범위를 비율로 구하기
        const scrollHeight = sceneInfo[currentScene].scrollHeight;
        const scrollRatio = currentYOffset / scrollHeight;

        if (values.length === 3) {
            // start ~ end 사이의 애니메이션 실행
            const partScrollStart = values[2].start * scrollHeight;
            const partScrollEnd = values[2].end * scrollHeight;
            const partScrollHeight = partScrollEnd - partScrollStart;

            if (partScrollStart <= currentYOffset && currentYOffset <= partScrollEnd) {
                rv = (currentYOffset - partScrollStart) / partScrollHeight * (values[1] - values[0]) + values[0];
            } else if (currentYOffset < partScrollStart) {
                rv = values[0];
            } else if (currentYOffset > partScrollEnd) {
                rv = values[1];
            }
        } else {
            // 현재 씬의 전체 범위에서 애니메이션 실행
            rv = scrollRatio * (values[1] - values[0]) + values[0];
        }
        return rv;
    }

    function playAnimation() {
        const objs = sceneInfo[currentScene].objs;
        const values = sceneInfo[currentScene].values;
        const currentYOffset = yOffset - prevScrollHeight;
        const scrollHeight = sceneInfo[currentScene].scrollHeight;
        const scrollRatio = currentYOffset / scrollHeight;

        switch (currentScene) {
            case 0:
                // console.log('0 play');
                // // 이미지 시퀀스를 구하는 부분 
                // let sequence = Math.round(calcValues(values.imageSequence, currentYOffset));
                // // 시퀀스를 적용해서 실제 canvas에 그려낸는 부분 
                // objs.context.drawImage(objs.videoImages[sequence], 0, 0);
                objs.canvas.style.opacity = calcValues(values.canvas_opacity, currentYOffset);

                if (scrollRatio <= 0.22) {
                    // in
                    objs.messageA.style.opacity = calcValues(values.messageA_opacity_in, currentYOffset);
                    objs.messageA.style.transform = `translateY(${calcValues(values.messageA_translateY_in, currentYOffset)}%)`;
                } else {
                    // out
                    objs.messageA.style.opacity = calcValues(values.messageA_opacity_out, currentYOffset);
                    objs.messageA.style.transform = `translateY(${calcValues(values.messageA_translateY_out, currentYOffset)}%)`;
                }

                if (scrollRatio <= 0.42) {
                    // in
                    objs.messageB.style.opacity = calcValues(values.messageB_opacity_in, currentYOffset);
                    objs.messageB.style.transform = `translate3d(0, ${calcValues(values.messageB_translateY_in, currentYOffset)}%, 0)`;
                } else {
                    // out
                    objs.messageB.style.opacity = calcValues(values.messageB_opacity_out, currentYOffset);
                    objs.messageB.style.transform = `translate3d(0, ${calcValues(values.messageB_translateY_out, currentYOffset)}%, 0)`;
                }

                if (scrollRatio <= 0.62) {
                    // in
                    objs.messageC.style.opacity = calcValues(values.messageC_opacity_in, currentYOffset);
                    objs.messageC.style.transform = `translate3d(0, ${calcValues(values.messageC_translateY_in, currentYOffset)}%, 0)`;
                } else {
                    // out
                    objs.messageC.style.opacity = calcValues(values.messageC_opacity_out, currentYOffset);
                    objs.messageC.style.transform = `translate3d(0, ${calcValues(values.messageC_translateY_out, currentYOffset)}%, 0)`;
                }

                if (scrollRatio <= 0.82) {
                    // in
                    objs.messageD.style.opacity = calcValues(values.messageD_opacity_in, currentYOffset);
                    objs.messageD.style.transform = `translate3d(0, ${calcValues(values.messageD_translateY_in, currentYOffset)}%, 0)`;
                } else {
                    // out
                    objs.messageD.style.opacity = calcValues(values.messageD_opacity_out, currentYOffset);
                    objs.messageD.style.transform = `translate3d(0, ${calcValues(values.messageD_translateY_out, currentYOffset)}%, 0)`;
                }
                break;

            case 2:
                // console.log('2 play');
                // let sequence2 = Math.round(calcValues(values.imageSequence, currentYOffset));
                // objs.context.drawImage(objs.videoImages[sequence2], 0, 0);

                // section 이동할 때 부드러운 처리
                if (scrollRatio <= 0.5) {
                    // in
                    objs.canvas.style.opacity = calcValues(values.canvas_opacity_in, currentYOffset);
                } else {
                    // out
                    objs.canvas.style.opacity = calcValues(values.canvas_opacity_out, currentYOffset);
                }

                if (scrollRatio <= 0.32) {
                    // in
                    objs.messageA.style.opacity = calcValues(values.messageA_opacity_in, currentYOffset);
                    objs.messageA.style.transform = `translate3d(0, ${calcValues(values.messageA_translateY_in, currentYOffset)}%, 0)`;
                } else {
                    // out
                    objs.messageA.style.opacity = calcValues(values.messageA_opacity_out, currentYOffset);
                    objs.messageA.style.transform = `translate3d(0, ${calcValues(values.messageA_translateY_out, currentYOffset)}%, 0)`;
                }

                if (scrollRatio <= 0.67) {
                    // in
                    objs.messageB.style.transform = `translate3d(0, ${calcValues(values.messageB_translateY_in, currentYOffset)}%, 0)`;
                    objs.messageB.style.opacity = calcValues(values.messageB_opacity_in, currentYOffset);
                    objs.pinB.style.transform = `scaleY(${calcValues(values.pinB_scaleY, currentYOffset)})`;
                } else {
                    // out
                    objs.messageB.style.transform = `translate3d(0, ${calcValues(values.messageB_translateY_out, currentYOffset)}%, 0)`;
                    objs.messageB.style.opacity = calcValues(values.messageB_opacity_out, currentYOffset);
                    objs.pinB.style.transform = `scaleY(${calcValues(values.pinB_scaleY, currentYOffset)})`;
                }

                if (scrollRatio <= 0.93) {
                    // in
                    objs.messageC.style.transform = `translate3d(0, ${calcValues(values.messageC_translateY_in, currentYOffset)}%, 0)`;
                    objs.messageC.style.opacity = calcValues(values.messageC_opacity_in, currentYOffset);
                    objs.pinC.style.transform = `scaleY(${calcValues(values.pinC_scaleY, currentYOffset)})`;
                } else {
                    // out
                    objs.messageC.style.transform = `translate3d(0, ${calcValues(values.messageC_translateY_out, currentYOffset)}%, 0)`;
                    objs.messageC.style.opacity = calcValues(values.messageC_opacity_out, currentYOffset);
                    objs.pinC.style.transform = `scaleY(${calcValues(values.pinC_scaleY, currentYOffset)})`;
                }

                // currentScene 3에서 쓰는 캔버스를 미리 그려주기 시작 -> animation X 단지 그려주기만! -> case : 3과 동일
                if (scrollRatio > 0.9) {
                    const objs = sceneInfo[3].objs;
                    const values = sceneInfo[3].values;

                    const widthRatio = window.innerWidth / objs.canvas.width;
                    const heightRatio = window.innerHeight / objs.canvas.height;
                    let canvasScaleRatio;

                    if (widthRatio <= heightRatio) {
                        canvasScaleRatio = heightRatio;
                    } else {
                        canvasScaleRatio = widthRatio;
                    }

                    objs.canvas.style.transform = `scale(${canvasScaleRatio})`;
                    objs.context.fillStyle = 'white';
                    objs.context.drawImage(objs.images[0], 0, 0);

                    const recalculatedInnerWidth = document.body.offsetWidth / canvasScaleRatio;
                    const recalculatedInnerHeight = window.innerHeight / canvasScaleRatio;

                    const whiteRectWidth = recalculatedInnerWidth * 0.15;
                    values.rect1X[0] = (objs.canvas.width - recalculatedInnerWidth) / 2;
                    values.rect1X[1] = values.rect1X[0] - whiteRectWidth;
                    values.rect2X[0] = values.rect1X[0] + recalculatedInnerWidth - whiteRectWidth;
                    values.rect2X[1] = values.rect2X[0] + whiteRectWidth;

                    objs.context.fillRect(parseInt(values.rect1X[0]), 0, parseInt(whiteRectWidth), objs.canvas.height);
                    objs.context.fillRect(parseInt(values.rect2X[0]), 0, parseInt(whiteRectWidth), objs.canvas.height);
                }

                break;

            case 3:
                // console.log('3 play');
                let step = 0;
                // 가로/세로 모두 꽉 차게 하기 위해 여기서 세팅(계산 필요)
                const widthRatio = window.innerWidth / objs.canvas.width;
                const heightRatio = window.innerHeight / objs.canvas.height;
                let canvasScaleRatio;

                // 비율에 따라서 canvas를 얼마나 크기 조절을 할지 다르게 결정
                if (widthRatio <= heightRatio) {
                    // 캔버스보다 브라우저 창이 홀쭉한 경우 
                    canvasScaleRatio = heightRatio;
                } else {
                    // 캔버스보다 브라우저 창이 납작한 경우
                    canvasScaleRatio = widthRatio;
                }

                objs.canvas.style.transform = `scale(${canvasScaleRatio})`;
                objs.context.fillStyle = 'white';
                objs.context.drawImage(objs.images[0], 0, 0);

                // 캔버스 사이즈에 맞춰 가정한 innerWidth와 innerHeight
                /* window.innerWidth : 스크롤바까지 포함한 크기 (오차 발생)
                document.body.offsetWidth : 스크롤바를 제외한 크기 (오차 극뽁) */
                const recalculatedInnerWidth = document.body.offsetWidth / canvasScaleRatio;
                const recalculatedInnerHeight = window.innerHeight / canvasScaleRatio;

                /* getBoundingClientRect() : 화면상에 있는 object에 크기와 위치를 가져올 수 있는 메소드
                스크롤의 속도에 따라 값이 생략되면서 오차가 발생 
                -> offsetTop (객체가 위에서부터 얼마나 떨어져 있는지 return) 사용
                -> 고정된 값을 얻을 수 있다. */
                if (!values.rectStartY) {
                    // values.rectStartY = objs.canvas.getBoundingClientRect().top;
                    values.rectStartY = objs.canvas.offsetTop + (objs.canvas.height - objs.canvas.height * canvasScaleRatio) / 2;
                    values.rect1X[2].start = (window.innerHeight / 2) / scrollHeight;
                    values.rect2X[2].start = (window.innerHeight / 2) / scrollHeight;
                    values.rect1X[2].end = values.rectStartY / scrollHeight;
                    values.rect2X[2].end = values.rectStartY / scrollHeight;
                }

                const whiteRectWidth = recalculatedInnerWidth * 0.15;
                values.rect1X[0] = (objs.canvas.width - recalculatedInnerWidth) / 2;
                values.rect1X[1] = values.rect1X[0] - whiteRectWidth;
                values.rect2X[0] = values.rect1X[0] + recalculatedInnerWidth - whiteRectWidth;
                values.rect2X[1] = values.rect2X[0] + whiteRectWidth;

                // 좌우 흰색 박스 그리기 (x, y, width, height)
                // 정적 
                // objs.context.fillRect(values.rect1X[0], 0, parseInt(whiteRectWidth), recalculatedInnerWidth);
                // objs.context.fillRect(values.rect2X[0], 0, parseInt(whiteRectWidth), recalculatedInnerWidth);
                // 동적 (animation)
                objs.context.fillRect(parseInt(calcValues(values.rect1X, currentYOffset)), 0, parseInt(whiteRectWidth), objs.canvas.height);
                objs.context.fillRect(parseInt(calcValues(values.rect2X, currentYOffset)), 0, parseInt(whiteRectWidth), objs.canvas.height);

                // 캔버스가 브라우저 상단에 닿지 않았다면
                if (scrollRatio < values.rect1X[2].end) {
                    step = 1;
                    objs.canvas.classList.remove('sticky');
                } else {
                    step = 2;
                    // image blend

                    // 1. 그림이 채워지는 구간 (blend)
                    // values.blendHeight : [0, 0, { start: 0, end: 0 }]
                    values.blendHeight[0] = 0;
                    values.blendHeight[1] = objs.canvas.height;
                    values.blendHeight[2].start = values.rect1X[2].end; // 2번째 animation이 끝날 때
                    // 해당 scene의 전체 scroll height의 20%에 해당하는 구간동안 animation 재생 (duration)
                    values.blendHeight[2].end = values.blendHeight[2].start + 0.2;
                    const blendHeight = calcValues(values.blendHeight, currentYOffset);

                    objs.context.drawImage(objs.images[1],
                        0,
                        objs.canvas.height - blendHeight,
                        objs.canvas.width,
                        blendHeight,
                        0,
                        objs.canvas.height - blendHeight,
                        objs.canvas.width,
                        blendHeight
                    );

                    objs.canvas.classList.add('sticky');
                    objs.canvas.style.top = `${-(objs.canvas.height - objs.canvas.height * canvasScaleRatio) / 2}px`;

                    // 2. 그림이 작아지는 구간 (축소)
                    // section 3의 두번째 animation의 초기값 최종값 타이밍
                    if (scrollRatio > values.blendHeight[2].end) {
                        values.canvas_scale[0] = canvasScaleRatio;
                        values.canvas_scale[1] = document.body.offsetWidth / (objs.canvas.width * 1.5);
                        values.canvas_scale[2].start = values.blendHeight[2].end;
                        values.canvas_scale[2].end = values.canvas_scale[2].start + 0.2;

                        objs.canvas.style.transform = `scale(${calcValues(values.canvas_scale, currentYOffset)})`;
                        // 스크롤을 위로올렸을 떄 margintop이 생겨 animation 실행이 안되는 문제 해결
                        objs.canvas.style.marginTop = 0;
                    }

                    // 3. 그림이 올라가는 구간 (fixed 삭제)
                    if (scrollRatio > values.canvas_scale[2].end && values.canvas_scale[2].end > 0) {
                        // sticky가 삭제되었을 때의 위치 지정
                        // -> 두 개의 animation의 duration 합이 0.2+0.2 = 0.4
                        objs.canvas.classList.remove('sticky');
                        objs.canvas.style.marginTop = `${scrollHeight * 0.4}px`;

                        // 4. 문단 구간
                        // start, end 시점 계산
                        values.canvasCaption_opacity[2].start = values.canvas_scale[2].end;
                        values.canvasCaption_opacity[2].end = values.canvasCaption_opacity[2].start + 0.1;
                        values.canvasCaption_translateY[2].start = values.canvasCaption_opacity[2].start;
                        values.canvasCaption_translateY[2].end = values.canvasCaption_opacity[2].end;
                        // animation 적용 
                        objs.canvasCaption.style.opacity = calcValues(values.canvasCaption_opacity, currentYOffset);
                        objs.canvasCaption.style.transform = `translate3d(0, ${calcValues(values.canvasCaption_translateY, currentYOffset)}%, 0)`;
                    }
                }

                break;
        }
    }

    function scrollLoop() {
        // 씬이 바뀌는 순간에 순간적으로 계산에 오차가 발생할 수 있기 때문에 
        // 씬이 바뀌는 순간만큼은 playAnimation 실행을 pass
        enterNewScene = false;
        prevScrollHeight = 0;
        // 현재 눈앞에 몇 번째 스크롤 섹션이 스크롤 중인지를 판별 
        for (let i = 0; i < currentScene; i++) {
            prevScrollHeight += sceneInfo[i].scrollHeight;
        }

        if (delayedYOffset < prevScrollHeight + sceneInfo[currentScene].scrollHeight) {
            document.body.classList.remove('scroll-effect-end');
        }

        if (delayedYOffset > prevScrollHeight + sceneInfo[currentScene].scrollHeight) {
            enterNewScene = true;
            if (currentScene === sceneInfo.length - 1) {
                document.body.classList.add('scroll-effect-end');
            }
            // 하단 콘텐츠 추가 시 currentScene이 4가 되어 에러 발생 -> 해결
            if (currentScene < sceneInfo.length - 1) {
                currentScene++;
            }
            document.body.setAttribute('id', `show-scene-${currentScene}`);
        }
        if (delayedYOffset < prevScrollHeight) {
            enterNewScene = true;
            if (currentScene === 0) return; // 브라우저 바운스 효과로 인해 마이너스가 되는 것을 방지(모바일)
            currentScene--;
            document.body.setAttribute('id', `show-scene-${currentScene}`);
        }

        if (enterNewScene) return; // scene이 바뀌는 순간에 음수가 나오는 것을 방지 -> 찰나의 순간 방지 
        playAnimation();
    }

    function loop() {
        // O o . -> 거리가 점점 작아지면서 0에 수렴하는 원리
        delayedYOffset = delayedYOffset + (yOffset - delayedYOffset) * acc;

        // 새로운 씬에 들어간 순간이 아닐 떄만 실행 
        if (!enterNewScene) {
            if (currentScene === 0 || currentScene === 2) {
                const currentYOffset = delayedYOffset - prevScrollHeight;
                const objs = sceneInfo[currentScene].objs;
                const values = sceneInfo[currentScene].values;
                // 이미지 시퀀스를 구하는 부분 
                let sequence = Math.round(calcValues(values.imageSequence, currentYOffset));
                // 시퀀스를 적용해서 실제 canvas에 그려낸는 부분 
                if (objs.videoImages[sequence]) {
                    objs.context.drawImage(objs.videoImages[sequence], 0, 0);
                }
            }
        }

        rafId = requestAnimationFrame(loop);

        // 무한 loop 해결
        if (Math.abs(yOffset - delayedYOffset) < 1) {
            cancelAnimationFrame(rafId);
            rafState = false;
        }
    }

    /* 두 개의 차이
    DOMContentLoaded : html 객체들 DOM 구조만 로딩이 끝나면 바로 실행(이미지 같은 것은 로드가 안 되더라도) -> 그래서 더 빠름
    load : 웹 페이지에 있는 이미지 같은 리소스들까지 싹 다 로딩이 되고 나서 실행 */
    // window.addEventListener('DOMContentLoaded', setLayout);
    window.addEventListener('load', () => {
        setLayout();
        document.body.classList.remove('before-load');
        setLayout();
        // 처음 문서를 load했을 때 보여주기 위함
        sceneInfo[0].objs.context.drawImage(sceneInfo[0].objs.videoImages[0], 0, 0);

        // 버그 수정 2
        // 새로 고침 했을 때 canvas를 그려주지 않음(스크롤이 안 됐기 때문에)
        // -> 약간의 스크롤을 해줌 (2px씩 10번 부드럽게)
        // scrollTo(x,y) : (x,y)픽셀 위치로 스크롤 해줌 -> 시간차 필요
        let tempYOffset = yOffset; // 현재 스크롤 위치
        let tempScrollCount = 0; // 몇번 했는지
        if (yOffset > 0) { // 맨 위에서 새로고침 했을 때 방지
            let siId = setInterval(() => {
                window.scrollTo(0, tempYOffset);
                tempYOffset += 2;

                if (tempScrollCount > 10) {
                    clearInterval(siId);
                }

                tempScrollCount++;
            }, 20);
        }

        window.addEventListener('scroll', () => {
            yOffset = window.pageYOffset;
            scrollLoop();
            checkMenu();

            if (!rafState) {
                rafId = requestAnimationFrame(loop);
                rafState = true;
            }
        });

        // 윈도우 창의 사이즈가 변할 때 같이 반응하도록 
        window.addEventListener('resize', () => {
            // 핸드폰은 resize될 일이 없기 때문에
            if (window.innerWidth > 900) {
                // 3번째 신에서 그때그때 체크해 줘야 할 값이 많아짐 -> 에러 발생 -> 사이즈 바뀔 때마다 새로 고침
                window.location.reload();
            }
        });

        // orientationchange : 모바일 기기를 가로,세로로 변경할 때 발생하는 event
        window.addEventListener('orientationchange', () => {
            scrollTo(0, 0);
            setTimeout(() => {
                window.location.reload();
            }, 500);
        });

        /* transition이 발생했을 때 제거
        화살표 함수를 사용했기 때문에 this를 사용할 수 없다.
        화살표 함수 안에서의 this는 전역객체를 가리킨다. */
        document.querySelector('.loading').addEventListener('transitionend', (e) => {
            document.body.removeChild(e.currentTarget); // currentTargt = loading
        });
    });

    setCanvasImages();
})();
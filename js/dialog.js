define(["require", "exports", "tcx", "layout", "math"], function (require, exports, tcx_1, Layout, math_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function dialogStyle(inner) {
        return new Layout.Background(new Layout.Border(inner, [12, 12, 12, 12], null), "rgba(255, 255, 255, 1)");
    }
    function splitWithSeparators(s, sepRe) {
        let nr = new RegExp(sepRe, "g");
        let results = [];
        while (true) {
            let startIndex = nr.lastIndex;
            let result = nr.exec(s);
            if (result != null) {
                results.push(s.substring(startIndex, result.index));
                results.push(result[0]);
            }
            else {
                results.push(s.substring(startIndex));
                return results;
            }
        }
    }
    class LayoutWrappingText {
        constructor(text, fullText, font, fillColor, numLines) {
            this.text = text;
            this.fullText = fullText;
            this.font = font;
            this.fillColor = fillColor;
            this.numLines = numLines;
            // ctx.font = font[0] + "px " + font[1];
            // this.size = new Vector(ctx.measureText(text).width, font[0]);
            this.size = new math_1.Vector(0, font[0] * numLines);
        }
        draw(pos, size) {
            tcx_1.ctx.font = Math.min(this.font[0], Math.floor(size.y)) + "px " + this.font[1];
            let words = splitWithSeparators(this.text, /\s+/);
            let fullWords = splitWithSeparators(this.fullText, /\s+/);
            let lines = [];
            {
                let nextWordIndex = 0;
                let line = "";
                while (true) {
                    if (nextWordIndex >= words.length) {
                        if (line.length > 0) {
                            lines.push(line);
                        }
                        break;
                    }
                    let nextWord = words[nextWordIndex];
                    if (nextWord.indexOf("\n") !== -1) {
                        for (let i = 0; i < nextWord.length; i++) {
                            if (nextWord[i] === "\n") {
                                lines.push(line);
                                line = "";
                            }
                        }
                    }
                    else if (tcx_1.ctx.measureText(line + fullWords[nextWordIndex]).width < size.x) {
                        line += nextWord;
                    }
                    else {
                        if (line.length > 0) {
                            lines.push(line);
                        }
                        line = nextWord;
                    }
                    nextWordIndex += 1;
                }
            }
            tcx_1.ctx.fillStyle = this.fillColor;
            let lineIndex = 0;
            for (let line of lines.slice(-this.numLines)) {
                tcx_1.ctx.fillText(line, pos.x, pos.y + this.font[0] * (0.8 + lineIndex), size.x);
                lineIndex += 1;
            }
        }
        getSize() {
            return this.size;
        }
    }
    class DialogCursorPromptLayout {
        constructor(inner) {
            this.inner = inner;
        }
        getSize() { return this.inner.getSize(); }
        draw(pos, size) {
            this.inner.draw(pos, size);
            let promptSize = (Math.cos(tcx_1.gNow * Math.PI * 2 / DialogCursorPromptLayout.FLASH_RATE) + 1) / 2 * 0.5 + 0.5;
            // if (mod(Math.floor((gNow - promptSince) / FLASH_RATE), 2) === 1) return;
            let { x, y } = pos.add(size).sub(new math_1.Vector(30, 5));
            tcx_1.ctx.fillStyle = "white";
            tcx_1.ctx.strokeStyle = "black";
            tcx_1.ctx.lineWidth = 4;
            tcx_1.ctx.beginPath();
            tcx_1.ctx.moveTo(x, y - 5 * promptSize);
            tcx_1.ctx.lineTo(x + 20 * promptSize, y - 25 * promptSize);
            tcx_1.ctx.lineTo(x - 20 * promptSize, y - 25 * promptSize);
            tcx_1.ctx.closePath();
            tcx_1.ctx.fill();
            tcx_1.ctx.stroke();
        }
    }
    DialogCursorPromptLayout.FLASH_RATE = 0.75;
    function* dialog(message, menuOptions) {
        function drawDialog(layout) {
            tcx_1.draw();
            let scale = tcx_1.getWindowScale();
            tcx_1.ctx.save();
            tcx_1.ctx.scale(1 / scale, 1 / scale);
            let width = tcx_1.canvas.width * scale;
            let height = tcx_1.canvas.height * scale;
            let menusSize = layout.getSize();
            let menusPos = new math_1.Vector(Math.floor((width - menusSize.x) / 2), height - 20 - menusSize.y);
            layout.draw(menusPos, menusSize);
            tcx_1.ctx.restore();
        }
        let NUM_LINES = 3;
        let WIDTH = 900;
        let SECONDS_PER_CHARACTER = 1 / 30;
        let FONT = [48, tcx_1.UI_FONT];
        let fastFactor = 1 / 5;
        // Add a pause to the start
        message = "<0.25>" + message;
        let fullMessage = "";
        // Slowly reveal the message
        {
            let waitingUntil = tcx_1.gNow;
            let lastSoundTime = 0;
            let prevLines = [];
            let currentLineFull = "";
            let currentLineText = "";
            function* textWait() {
                while (tcx_1.gNow < waitingUntil) {
                    while (tcx_1.menuInputs.length > 0) {
                        let input = tcx_1.menuInputs.shift();
                    }
                    let drawnMessage = prevLines.concat(currentLineText).join("\n");
                    let drawnFullMessage = prevLines.concat(currentLineFull).join("\n");
                    drawDialog(dialogStyle(new Layout.MinSize(new LayoutWrappingText(drawnMessage, drawnFullMessage, FONT, "black", NUM_LINES), new math_1.Vector(WIDTH, 0))));
                    yield;
                }
            }
            for (let line of message.split("\n")) {
                let entries = splitWithSeparators(line, /<[^>]*>/);
                currentLineFull = line.replace(/<[^>]*>/g, "");
                currentLineText = "";
                let isCommand = false;
                for (let entry of entries) {
                    if (isCommand) {
                        let command = entry.substring(1, entry.length - 1);
                        if (/^\d+(?:\.\d+)$/.test(command)) {
                            let timeToWait = parseFloat(command);
                            waitingUntil += timeToWait * (tcx_1.wantFastDialog ? fastFactor : 1);
                            yield* textWait();
                        }
                        else if (command === "*") {
                            waitForInput: while (true) {
                                waitingUntil = tcx_1.gNow;
                                if (tcx_1.wantFastDialog)
                                    break;
                                while (tcx_1.menuInputs.length > 0) {
                                    let input = tcx_1.menuInputs.shift();
                                    if (input === "select") {
                                        tcx_1.playSound("sound/cursverti.wav");
                                        break waitForInput;
                                    }
                                }
                                let drawnMessage = prevLines.concat(currentLineText).join("\n");
                                let drawnFullMessage = prevLines.concat(currentLineFull).join("\n");
                                let dialogInner = dialogStyle(new Layout.MinSize(new LayoutWrappingText(drawnMessage, drawnFullMessage, FONT, "black", NUM_LINES), new math_1.Vector(WIDTH, 0)));
                                drawDialog(new DialogCursorPromptLayout(dialogInner));
                                yield;
                            }
                        }
                        else {
                            console.warn("Unrecognized dialog command: " + command);
                        }
                    }
                    else {
                        for (let char of entry) {
                            if (/\S/.test(char) && tcx_1.gNow > lastSoundTime + 0.1) {
                                tcx_1.playSound("sound/text.wav");
                                lastSoundTime = tcx_1.gNow;
                            }
                            currentLineText += char;
                            waitingUntil += SECONDS_PER_CHARACTER * (tcx_1.wantFastDialog ? fastFactor : 1);
                            yield* textWait();
                        }
                    }
                    isCommand = !isCommand;
                }
                waitingUntil += 0.25 * (tcx_1.wantFastDialog ? fastFactor : 1);
                yield* textWait();
                if (prevLines.length >= NUM_LINES - 1) {
                    prevLines.shift();
                }
                prevLines.push(currentLineFull);
            }
            fullMessage = prevLines.join("\n");
        }
        // Finally present the prompt
        let index = 0;
        while (true) {
            if (menuOptions.length > 0) {
                while (tcx_1.menuInputs.length > 0) {
                    let input = tcx_1.menuInputs.shift();
                    if (input === "left") {
                        tcx_1.playSound("sound/curshoriz.wav");
                        index = math_1.mod(index - 1, menuOptions.length);
                    }
                    else if (input === "right") {
                        tcx_1.playSound("sound/curshoriz.wav");
                        index = math_1.mod(index + 1, menuOptions.length);
                    }
                    else if (input === "select") {
                        tcx_1.playSound("sound/cursverti.wav");
                        return index;
                    }
                }
                let layoutMessage = new LayoutWrappingText(fullMessage, fullMessage, FONT, "black", NUM_LINES - 1);
                let layoutOptions = menuOptions.map((s, i) => {
                    let layout = new Layout.Text(s, [48, tcx_1.UI_FONT], "black");
                    if (i === index) {
                        layout = new tcx_1.CursorLayout(layout, true);
                    }
                    return layout;
                }).reduce((arr, l) => Layout.horizontal([arr, new Layout.Empty(new math_1.Vector(100, 0)), l]));
                drawDialog(dialogStyle(new Layout.MinSize(Layout.vertical([layoutMessage, layoutOptions]), new math_1.Vector(WIDTH, 0))));
                yield;
            }
            else {
                while (tcx_1.menuInputs.length > 0) {
                    let input = tcx_1.menuInputs.shift();
                    if (input === "select") {
                        tcx_1.playSound("sound/cursverti.wav");
                        return -1;
                    }
                }
                let layoutMessage = dialogStyle(new Layout.MinSize(new LayoutWrappingText(fullMessage, fullMessage, FONT, "black", NUM_LINES), new math_1.Vector(WIDTH, 0)));
                drawDialog(new DialogCursorPromptLayout(layoutMessage));
                yield;
            }
        }
    }
    exports.dialog = dialog;
});
//# sourceMappingURL=dialog.js.map
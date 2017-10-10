import {ctx, canvas, draw, getWindowScale, UI_FONT, gNow, menuInputs, playSound, CursorLayout, wantFastDialog} from "tcx";
import * as Layout from "layout";
import {Vector, mod} from "math";

function dialogStyle(inner: Layout.Layout): Layout.Layout {
    return new Layout.Background(new Layout.Border(inner, [12, 12, 12, 12], null), "rgba(255, 255, 255, 1)");
}

function splitWithSeparators(s: string, sepRe: RegExp): string[] {
    let nr = new RegExp(sepRe, "g");
    let results: string[] = [];
    while (true) {
        let startIndex = nr.lastIndex;
        let result = nr.exec(s);
        if (result != null) {
            results.push(s.substring(startIndex, result.index));
            results.push(result[0]);
        } else {
            results.push(s.substring(startIndex));
            return results;
        }
    }
}

class LayoutWrappingText implements Layout.Layout {
    private size: Vector;
    constructor(private text: string, private fullText: string, private font: [number, string], private fillColor: string, private numLines: number) {
        // ctx.font = font[0] + "px " + font[1];
        // this.size = new Vector(ctx.measureText(text).width, font[0]);
        this.size = new Vector(0, font[0] * numLines);
    }
    draw(pos: Vector, size: Vector) {
        ctx.font = Math.min(this.font[0], Math.floor(size.y)) + "px " + this.font[1];
        let words = splitWithSeparators(this.text, /\s+/);
        let fullWords = splitWithSeparators(this.fullText, /\s+/);

        let lines: string[] = [];
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
                } else if (ctx.measureText(line + fullWords[nextWordIndex]).width < size.x) {
                    line += nextWord;
                } else {
                    if (line.length > 0) {
                        lines.push(line);
                    }
                    line = nextWord;
                }
                nextWordIndex += 1;
            }
        }

        ctx.fillStyle = this.fillColor;
        let lineIndex = 0;
        for (let line of lines.slice(-this.numLines)) {
            ctx.fillText(line, pos.x, pos.y + this.font[0] * (0.8 + lineIndex), size.x);
            lineIndex += 1;
        }
    }
    getSize() {
        return this.size;
    }
}

class DialogCursorPromptLayout implements Layout.Layout {
    static FLASH_RATE = 0.75;
    constructor(private inner: Layout.Layout) {}
    getSize() { return this.inner.getSize(); }
    draw(pos: Vector, size: Vector) {
        this.inner.draw(pos, size);
        let promptSize = (Math.cos(gNow * Math.PI * 2 / DialogCursorPromptLayout.FLASH_RATE) + 1) / 2 * 0.5 + 0.5;
        // if (mod(Math.floor((gNow - promptSince) / FLASH_RATE), 2) === 1) return;
        let {x, y} = pos.add(size).sub(new Vector(30, 5));
        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y - 5 * promptSize);
        ctx.lineTo(x + 20 * promptSize, y - 25 * promptSize);
        ctx.lineTo(x - 20 * promptSize, y - 25 * promptSize);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
}

export function* dialog(message: string, menuOptions: string[]): IterableIterator<any> {
    function drawDialog(layout: Layout.Layout) {
        draw();

        let scale = getWindowScale();
        ctx.save();
        ctx.scale(1 / scale, 1 / scale);
        let width = canvas.width * scale;
        let height = canvas.height * scale;

        let menusSize = layout.getSize();
        let menusPos = new Vector(Math.floor((width - menusSize.x) / 2), height - 20 - menusSize.y);
        layout.draw(menusPos, menusSize);
        ctx.restore();
    }

    let NUM_LINES = 3;
    let WIDTH = 900;
    let SECONDS_PER_CHARACTER = 1 / 30;
    let FONT: [number, string] = [48, UI_FONT];
    let fastFactor = 1 / 5;

    // Add a pause to the start
    message = "<0.25>" + message;
    let fullMessage = "";

    // Slowly reveal the message
    {
        let waitingUntil = gNow;
        let lastSoundTime = 0;
        let prevLines: string[] = [];
        let currentLineFull = "";
        let currentLineText = "";
        function* textWait(): IterableIterator<any> {
            while (gNow < waitingUntil) {
                while (menuInputs.length > 0) {
                    let input = menuInputs.shift();
                }
                let drawnMessage = prevLines.concat(currentLineText).join("\n");
                let drawnFullMessage = prevLines.concat(currentLineFull).join("\n");
                drawDialog(dialogStyle(new Layout.MinSize(new LayoutWrappingText(drawnMessage, drawnFullMessage, FONT, "black", NUM_LINES), new Vector(WIDTH, 0))));
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
                        waitingUntil += timeToWait * (wantFastDialog ? fastFactor : 1);
                        yield* textWait();
                    } else if(command === "*") {
                        waitForInput: while (true) {
                            waitingUntil = gNow;
                            if (wantFastDialog) break;
                            while (menuInputs.length > 0) {
                                let input = menuInputs.shift();
                                if (input === "select") {
                                    playSound("sound/cursverti.wav");
                                    break waitForInput;
                                }
                            }
                            let drawnMessage = prevLines.concat(currentLineText).join("\n");
                            let drawnFullMessage = prevLines.concat(currentLineFull).join("\n");
                            let dialogInner = dialogStyle(new Layout.MinSize(new LayoutWrappingText(drawnMessage, drawnFullMessage, FONT, "black", NUM_LINES), new Vector(WIDTH, 0)));
                            drawDialog(new DialogCursorPromptLayout(dialogInner));
                            yield;
                        }
                    } else {
                        console.warn("Unrecognized dialog command: " + command);
                    }
                } else {
                    for (let char of entry) {
                        if (/\S/.test(char) && gNow > lastSoundTime + 0.1) {
                            playSound("sound/text.wav");
                            lastSoundTime = gNow;
                        }
                        currentLineText += char;
                        waitingUntil += SECONDS_PER_CHARACTER * (wantFastDialog ? fastFactor : 1);
                        yield* textWait();
                    }
                }
                isCommand = !isCommand;
            }
            waitingUntil += 0.25 * (wantFastDialog ? fastFactor : 1);
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
            while (menuInputs.length > 0) {
                let input = menuInputs.shift();
                if (input === "left") {
                    playSound("sound/curshoriz.wav");
                    index = mod(index - 1, menuOptions.length);
                } else if (input === "right") {
                    playSound("sound/curshoriz.wav");
                    index = mod(index + 1, menuOptions.length);
                } else if (input === "select") {
                    playSound("sound/cursverti.wav");
                    return index;
                }
            }
            let layoutMessage = new LayoutWrappingText(fullMessage, fullMessage, FONT, "black", NUM_LINES - 1);
            let layoutOptions = menuOptions.map((s, i) => {
                let layout: Layout.Layout = new Layout.Text(s, [48, UI_FONT], "black");
                if (i === index) {
                    layout = new CursorLayout(layout, true);
                }
                return layout;
            }).reduce((arr, l) => Layout.horizontal([arr, new Layout.Empty(new Vector(100, 0)), l]));
            drawDialog(dialogStyle(new Layout.MinSize(Layout.vertical([layoutMessage, layoutOptions]), new Vector(WIDTH, 0))));
            yield;
        } else {
            while (menuInputs.length > 0) {
                let input = menuInputs.shift();
                if (input === "select") {
                    playSound("sound/cursverti.wav");
                    return -1;
                }
            }
            let layoutMessage = dialogStyle(new Layout.MinSize(new LayoutWrappingText(fullMessage, fullMessage, FONT, "black", NUM_LINES), new Vector(WIDTH, 0)));
            drawDialog(new DialogCursorPromptLayout(layoutMessage));
            yield;
        }
    }
}
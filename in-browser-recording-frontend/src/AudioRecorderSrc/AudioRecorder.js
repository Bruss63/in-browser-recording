import React, { useState, useEffect, useRef } from "react";
import "./AudioRecorder.css";
//Icons
import Pause from "./Icons/PauseIcon";
import Play from "./Icons/PlayIcon";
import Stop from "./Icons/StopIcon";
import Playback from "./Icons/PlaybackIcon";
import Mic from "./Icons/MicIcon";
import Reset from "./Icons/UndoIcon";
import Loading from "./Icons/LoadingIcon";
//Modules
import AudioAnalyser from "./Modules/AudioAnalyser";
import { blobToFile } from "./Modules/Utilities.js";
//Worker Imports
import recorderWorker from "./recorderWorker";
import WebWorker from "./workerSetup";

function AudioRecorder({
	onFileReady /*File Callback to Parent*/,
	type = "compact" /*Changes Type of Recorder*/,
	shape = "circular" /*Changes Shape of Edges*/,
	backgroundColor = "rgb(65, 64, 77)" /*Colour of Background*/,
	btnColor = "rgb(114, 121, 133)" /*Colour of Interface Buttons*/,
	display = "inline-block" /*Change Display of Container*/,
	playback = false /*Enables and Disables Playback Function !!!Not Finished!!!*/,
	fileType = "audio/wav" /*Specify File Type*/,
	bufferSize = 1024 /*Specify Size of Each Audio Chunk*/,
	channelNumber = 2 /*Specify Number of Audio Channels, 1 for Mono, 2 for Stereo*/,
	logging = {
		recorder: false,
		controls: false,
	} /*Toggle Detailed Operations Logging*/,
	stream = false /*Toggle Intermediate Data Transmission*/,
}) {
	//States
	const constraints = { audio: true, video: false };
	const [recording, setRecording] = useState(false);
	const [started, setStarted] = useState(false);
	const [audioCtx, setAudioCtx] = useState(undefined);
	const [worker, setWorker] = useState(undefined);
	const [audioPlayerState, setAudioPlayerState] = useState("paused");
	const [source, setSource] = useState(undefined);
	const [setupDone, setSetupDone] = useState(false);
	const [mode, setMode] = useState("recording");
	const [style, setStyle] = useState({});
	const [windowWidth, setWindowWidth] = useState(window.innerWidth * 0.2);
	//Refs
	const audioPlayerRef = useRef(null);
	const recordingRef = useRef(false);
	const streamRef = useRef(undefined);
	const loggingConfig = useRef(logging);
	//Setup
	const beginSetup = () => {
		setAudioCtx(
			new AudioContext({
				sampleRate: 16000,
			})
		);
		const worker = new WebWorker(recorderWorker);
		worker.onmessage = (e) => {
			if (loggingConfig.current.recorder === true) {
				console.log({
					responseType: "Worker Message",
					message: e.data.message,
				});
			}

			if (e.data.payload) {
				let payload = e.data.payload;
				if (payload.type === "wavExport") {
					let blob = payload.data;
					let file = blobToFile(blob, "recording");
					onFileReady(file);
					if (loggingConfig.current.recorder === true) {
						console.log(file);
					}
				} else if (payload.type === "wavDataExport") {
					onFileReady(payload.data);
				}
			}
		};
		worker.onerror = (e) => {
			if (loggingConfig.current.recorder === true) {
				console.log({ responseType: "Worker Error", e });
			}
		};
		setWorker(worker);
	};

	const getStream = () => {
		//Ask for mic in browser
		if (audioCtx !== undefined) {
			console.log(audioCtx);
			console.log({ message: "Attempting to Get Stream" });
			navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
				streamRef.current = stream;
				let source = audioCtx.createMediaStreamSource(stream);
				setSource(source);
			});
		}
	};

	const createProcessor = () => {
		if (source !== undefined) {
			console.log(source);
			source.context.resume();
			let node = source.context.createScriptProcessor(
				bufferSize,
				channelNumber,
				channelNumber
			);
			source.connect(node);
			node.connect(source.context.destination);
			node.onaudioprocess = (e) => {
				if (!recordingRef.current) {
					if (loggingConfig.current.recorder === true) {
						console.log("blocking recording");
					}

					return;
				} else {
					let buffers = [];
					let left = e.inputBuffer.getChannelData(0);
					buffers.push(left);
					if (channelNumber === 2) {
						let right = e.inputBuffer.getChannelData(1);
						buffers.push(right);
					}
					worker.postMessage({
						command: "record",
						buffers: {
							buffers,
						},
					});
					if (stream === true) {
						worker.postMessage({
							command: "exportWavData",
							type: fileType,
						});
					}
				}
			};
			worker.postMessage({
				command: "config",
				config: {
					sampleRate: audioCtx.sampleRate,
					exportSampleRate: 16000,
					numChannels: node.channelCount,
					logging: loggingConfig.current.recorder,
				},
			});
			console.log(node);
			setSetupDone(true);
		}
	};

	const configureUI = () => {
		let borderRadius = "0px";
		let width = "70px";
		let height = "70px";
		let position = "relative";
		let bottom = null;
		let left = null;
		if (shape === "circular") {
			borderRadius = "35px";
		} else if (shape === "rounded") {
			borderRadius = "15px";
		}
		if (type === "docked") {
			width = "100%";
			height = "70px";
			position = "absolute";
			bottom = "0";
			left = "0";
			borderRadius = "0px";
		} else if (type === "large") {
			width = "210px";
			height = "140px";
		} else if (type === "small") {
			if (playback) {
				width = "210px";
			} else {
				width = "140px";
			}
		}

		setStyle({
			backgroundColor,
			borderRadius,
			width,
			height,
			display,
			position,
			bottom,
			left,
		});
	};

	//Recording Functions
	const beginRecording = () => {
		console.log({ message: "Beginning Recording" });
		setRecording(true);
		setStarted(true);
	};

	const stopRecording = () => {
		console.log({ message: "Stopping Recording" });
		setRecording(false);
		if (stream === false) {
			worker.postMessage({
				command: "exportWavFile",
				type: fileType,
			});
		}
	};

	const pauseRecording = () => {
		console.log({ message: "Pausing Recording" });
		setRecording(false);
	};

	const startRecording = () => {
		console.log({ message: "Starting Recording" });
		setRecording(true);
	};

	const resetRecording = () => {
		console.log({ message: "Reseting Recording" });
		setRecording(false);
		setStarted(false);
		worker.postMessage({
			command: "clear",
		});
	};

	//Playback Functions
	const startPlayback = () => {
		audioPlayerRef.current.play();
		setAudioPlayerState("playing");
	};

	const stopPlayback = () => {
		audioPlayerRef.current.pause();
		setAudioPlayerState("paused");
	};

	const updateWidth = () => {
		setWindowWidth(window.innerWidth * 0.2);
	};

	useEffect(() => {
		//Run on open
		beginSetup();
		configureUI();
		//Run on close
		return () => {
			audioCtx.close();
		};
	}, []);

	useEffect(() => {
		window.addEventListener("resize", updateWidth);
		return () => window.removeEventListener("resize", updateWidth);
	});

	useEffect(() => {
		recordingRef.current = recording;
	}, [recording]);

	useEffect(() => {
		getStream();
	}, [audioCtx]);

	useEffect(() => {
		//Run when source is ready
		createProcessor();
	}, [source]);

	//Button handlers
	const handleChangeMode = () => {
		if (recording === true) {
			alert("please finish recording before changing modes");
		} else {
			if (mode === "playback") {
				setMode("recording");
			} else {
				setMode("playback");
			}
		}
	};

	const handleCompactButton = () => {
		if (recording === false && started === false) {
			beginRecording();
		} else if (recording === true) {
			stopRecording();
		} else {
			resetRecording();
		}
	};

	const handlePausePlay = () => {
		if (mode === "recording") {
			if (recording === false) {
				beginRecording();
			} else if (recording === true) {
				pauseRecording();
			} else if (recording === false) {
				// change this
				startRecording();
			}
		} else {
			if (audioPlayerState === "paused") {
				startPlayback();
			} else {
				stopPlayback();
			}
		}
	};

	const handleStopReset = () => {
		if (recording === true) {
			stopRecording();
		} else {
			resetRecording();
		}
	};

	//Combining icons with state conditions
	const Mode = ({ fill }) => {
		if (mode === "recording") {
			return <Playback fill={fill} />;
		} else if (mode === "playback") {
			return <Mic fill={fill} />;
		}
	};

	const CompactButton = ({ fill }) => {
		if (recording === false && started === false) {
			return <Play fill={fill} />;
		} else if (recording === true) {
			return <Stop fill={fill} />;
		} else {
			return <Reset fill={fill} />;
		}
	};

	const PausePlay = ({ fill }) => {
		if (mode === "recording") {
			if (recording === true) {
				return <Pause fill={fill} />;
			} else {
				return <Play fill={fill} />;
			}
		} else {
			if (audioPlayerState === "playing") {
				return <Pause fill={fill} />;
			} else {
				return <Play fill={fill} />;
			}
		}
	};

	const StopReset = ({ fill }) => {
		if (recording === false) {
			return <Reset fill={fill} />;
		} else {
			return <Stop fill={fill} />;
		}
	};

	//Rendering
	if (type === "docked") {
		if (setupDone === false) {
			return (
				<div style={style} className={"container"}>
					<h1 className={"icon"}>
						<Loading fill={btnColor} />
					</h1>
				</div>
			);
		} else {
			if (mode === "recording") {
				return (
					<div style={style} className={"container"}>
						{playback ? (
							<button
								className={"icon"}
								onClick={handleChangeMode}>
								<Mode fill={btnColor} />
							</button>
						) : null}
						<button className={"icon"} onClick={handlePausePlay}>
							<PausePlay fill={btnColor} />
						</button>
						{source ? (
							<AudioAnalyser
								width={windowWidth}
								audio={streamRef.current}
							/>
						) : null}
						<button className={"icon"} onClick={handleStopReset}>
							<StopReset fill={btnColor} />
						</button>
					</div>
				);
			} else {
				return (
					<div style={style} className={"container"}>
						{playback ? (
							<button
								className={"icon"}
								onClick={handleChangeMode}>
								<Mode fill={btnColor} />
							</button>
						) : null}
						<button className={"icon"} onClick={handlePausePlay}>
							<PausePlay fill={btnColor} />
						</button>
						<button className={"icon"} onClick={handleStopReset}>
							<StopReset fill={btnColor} />
						</button>
					</div>
				);
			}
		}
	} else if (type === "large") {
		if (setupDone === false) {
			return (
				<div style={style} className={"container"}>
					<h1 className={"icon"}>
						<Loading fill={btnColor} />
					</h1>
				</div>
			);
		} else {
			if (mode === "recording") {
				return (
					<div style={style} className={"container"}>
						<h1 style={{ color: btnColor }} className={"error"}>
							{"WIP"}
						</h1>
					</div>
				);
			} else {
				return (
					<div style={style} className={"container"}>
						<h1 style={{ color: btnColor }} className={"error"}>
							{"WIP"}
						</h1>
					</div>
				);
			}
		}
	} else if (type === "small") {
		if (setupDone === false) {
			return (
				<div style={style} className={"container"}>
					<h1 className={"icon"}>
						<Loading fill={btnColor} />
					</h1>
				</div>
			);
		} else {
			if (mode === "recording") {
				return (
					<div style={style} className={"container"}>
						{playback ? (
							<button
								className={"icon"}
								onClick={handleChangeMode}>
								<Mode fill={btnColor} />
							</button>
						) : null}
						<button className={"icon"} onClick={handlePausePlay}>
							<PausePlay fill={btnColor} />
						</button>
						<button className={"icon"} onClick={handleStopReset}>
							<StopReset fill={btnColor} />
						</button>
					</div>
				);
			} else {
				return (
					<div style={style} className={"container"}>
						{playback ? (
							<button
								className={"icon"}
								onClick={handleChangeMode}>
								<Mode fill={btnColor} />
							</button>
						) : null}
						<h1
							style={{ color: btnColor }}
							className={"audio-error"}>
							{"No Audio"}
							<br />
							{"Recored"}
						</h1>
					</div>
				);
			}
		}
	} else if (type === "compact") {
		if (setupDone === false) {
			return (
				<div style={style} className={"container"}>
					<h1 className={"icon"}>
						<Loading fill={btnColor} />
					</h1>
				</div>
			);
		} else {
			return (
				<div style={style} className={"container"}>
					<button className={"icon"} onClick={handleCompactButton}>
						<CompactButton fill={btnColor} />
					</button>
				</div>
			);
		}
	} else {
		return null;
	}
}

export default AudioRecorder;

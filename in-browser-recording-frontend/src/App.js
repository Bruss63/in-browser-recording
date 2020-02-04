import React, { Component } from "react";
import AudioAnalyser from './Modules/AudioAnalyser.js';
import microphone from "./Assets/microphone-logo.svg";
import reset from "./Assets/reset.svg";
import stop from "./Assets/stop.svg";
import play from "./Assets/play.svg";
import "./App.css";
import axios from "axios";

class App extends Component {
	constructor() {
		super();
		this.stream = null;
		this.saveDataOptions = {
			clientDownload: false,
			S3Upload: true
		}
		this.constraints = { audio: true, video: false };
		this.mediaRecorder = null;
		this.mediaRecorderType = null;
		this.recordedFile = null;
		this.minimumRecordTime = 1;
		this.state = {
			isUploading: false,
			isSubmitted: false,
			isRestarting: false,
			isRecordingPane: false,
			timerDisplaying: false,
			timerActive: false,
			isStopped: true,
			min: 0,
			sec: 0,
			ms: 0,
			start: 0
		};
	}


	//Custom Buttons
	TimerDisplay = () => {
		let { ms, sec, min, timerDisplaying } = this.state;
		ms = ms.toString();
		sec = sec.toString();
		min = min.toString();

		while (ms.length !== 4) {
			ms = 0 + ms;
		}

		while (sec.length !== 2) {
			sec = 0 + sec;
		}

		while (min.length !== 2) {
			min = 0 + min;
		}

		if (timerDisplaying) {
			return (
				<div>
					<h1 className="clock-face">
						{min}
						{":"}
						{sec}
						{":"}
						{ms}
					</h1>
				</div>
			);
		} else {
			return null;
		}
	};

	SubmitButton = () => {
		let { sec, min, isStopped } = this.state;
		if ((sec >= this.minimumRecordTime || min >= 1) && isStopped) {
			return (
				<button className="submit-button" onClick={this.handleSubmit}>
					{"Submit"}
				</button>
			);
		} else if (sec < this.minimumRecordTime && !isStopped) {
			return <h1 className="error-message">{"Recording Too Short!!!"}</h1>;
		} else {
			return null;
		}
	};

	MainButtonCluster = () => {
		let { isRecordingPane, isSubmitted, isRestarting } = this.state;

		if (!isRecordingPane) {
			return (
				<button className="record-button" onClick={this.handleStartRecorder}>
					<img className="microphone" src={microphone} alt="err"></img>
				</button>
			);
		} else if (isRecordingPane) {
			return (
				<div className="main-button-wrapper">
					<button
						className="stop-button"
						onClick={
							isRestarting
								? this.handleStartRecorderFromReset
								: this.handleStopRecorder
						}
					>
						<img
							className="stop-icon"
							src={isRestarting ? play : stop}
							alt="err"
						/>
					</button>

					{!isSubmitted ? (
						<button className="reset-button" onClick={this.handleReset}>
							<img className="reset" src={reset} alt="err" />
						</button>
					) : (
						""
					)}
				</div>
			);
		}
	};
	//Handlers
	handleSubmit = () => {
		console.log("Submit Attempted");
		this.stopMic();
		this.stopTimer();
		this.saveData();
		this.setState({ isSubmitted: true });
	};

	handleStartRecorderFromReset = () => {
		this.mediaRecorder.start();
		this.startTimer();
		this.setState({ isStopped: false, isRestarting: false });
	};

	handleStartRecorder = async () => {
		await this.startRecorder();
		this.setState({
			isRecordingPane: true,
			isStopped: false
		});
		this.startTimer();
	};

	handleStopRecorder = () => {
		this.setState({ isStopped: true });
		this.stopTimer();
		this.stopRecorder();
	};

	handleReset = () => {
		this.resetTimer();
		this.resetRecorder();
		this.setState({ isRestarting: true, isStopped: true });
	};

	startRecorder = async () => {
		this.stream = await this.getMic();
		if (this.stream) {
			console.log("Aquired Stream ");
		}
		this.mediaRecorder = new window.MediaRecorder(this.stream);
		this.mediaRecorderType = this.mediaRecorder.mimeType;
		this.recordedChunks = [];
		this.mediaRecorder.start();
		this.mediaRecorder.ondataavailable = event => {
			if (event.data && event.data.size > 0) {
				console.log("Data Valid Attempting Storage");
				this.recordedChunks.push(event.data);
			} else {
				console.log("Data Empty or Corrupt");
			}
		};
	};
	//Recorder Functions
	stopRecorder = () => {
		if (this.mediaRecorder.state !== "inactive") {
			this.mediaRecorder.stop();
		}
	};

	resetRecorder = async () => {
		this.setState({ isStopped: true });
		if (this.mediaRecorder.state !== "inactive") {
			this.mediaRecorder.stop();
		}
		this.recordedChunks = [];
		console.log(this.recordedChunks);
	};
	//Data Functions
	saveData = async () => {
		console.log(this.recordedChunks);
		let file = new File(this.recordedChunks, "test.webm");
		if (file.size > 0) {
			console.log("Data Successfully Saved");
			console.log(file);
		} else {
			console.log("Save Failed");
		}

		//File Handling Excecution
		let { clientDownload,S3Upload } = this.saveDataOptions
		if (clientDownload) {
			this.clientDownload(file);
		}
		if (S3Upload) {
			this.setState({ isUploading: true })
			await this.S3Upload(file);
			this.setState({ isUploading: false });
		}
		if (!clientDownload && !S3Upload) {
			console.log("No file Handling Selected!!!")
		}
	};

	clientDownload = (fileData) => {
		console.log("Client Download Initiated")
		const url = window.URL.createObjectURL(fileData);
		const a = document.createElement("a");
		a.href = url;
		a.download = "VoicePrint.webm";
		a.click();
		console.log("Client Download Successful");
	}

	S3Upload = (fileData, onUploadProgress) => {
		console.log("S3 Upload Attempted")
		const options = {
			url:
				"https://voiceprint-recordings.s3-ap-southeast-2.amazonaws.com/VoicePrint.webm",
			method: "put",
			data: fileData,
			headers: { "Content-Type": "audio/*" },
			onUploadProgress: onUploadProgress
		};
		return axios.put("https://voiceprint-recordings.s3-ap-southeast-2.amazonaws.com/VoicePrint.webm", fileData, options);
	};
	//Mic Functions
	getMic = async () => {
		console.log("Attempting to Aquire Stream");
		let stream = await navigator.mediaDevices.getUserMedia(this.constraints);
		return stream;
	};

	stopMic = () => {
		if (this.stream) {
			this.stream.getTracks().forEach(track => track.stop());
			this.setState({ stream: null });
		}
	};
	//Timer Functions
	startTimer = () => {
		this.setState({
			timerActive: true,
			timerDisplaying: true,
			time: this.state.time,
			start: Date.now() - this.state.ms
		});
		this.timer = setInterval(this.updateTimer, 1);
	};

	updateTimer = () => {
		let ms = Date.now() - this.state.start;
		let sec = this.state.sec;
		let min = this.state.min;
		if (ms >= 1000) {
			this.setState({ start: Date.now() });
			sec += 1;
		}
		if (sec >= 60) {
			sec = 0;
			min += 1;
		}
		this.setState({
			ms: Date.now() - this.state.start,
			sec: sec,
			min: min
		});
	};

	stopTimer = () => {
		this.setState({ timerActive: false });
		clearInterval(this.timer);
	};

	resetTimer = () => {
		this.setState({
			timerActive: false,
			min: 0,
			sec: 0,
			ms: 0,
			timerDisplaying: false
		});
		clearInterval(this.timer);
	};

	toggleTimer = () => {
		if (this.state.timerActive) {
			this.stopTimer();
		} else if (!this.state.timerActive) {
			this.startTimer();
		}
	};
	//Renderer	
	render() {
		return (
			<div className="App">
				<h1>{"Record VoicePrint"}</h1>
				<this.MainButtonCluster />
				<this.TimerDisplay />
				<this.SubmitButton />
				{!this.state.isStopped ? <AudioAnalyser audio={this.stream} /> : ""}
			</div>
		);
	}
}


export default App;

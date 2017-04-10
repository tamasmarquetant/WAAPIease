let audioContext = new AudioContext();
///////////////////////////////////////////////////////////////////////////
// TYPE CHECKING
///////////////////////////////////////////////////////////////////////////
/**
*  test if the arg is undefined
*  @param {*} arg the argument to test
*  @returns {boolean} true if the arg is undefined
*  @function
*/
function isUndef (val) {
    return typeof val === 'undefined';
};

/**
*  Test if the given argument is an object literal (i.e. `{}`);
*  @param {*} arg the argument to test
*  @returns {boolean} true if the arg is an object literal.
*/
function isObject(arg) {
    return Object.prototype.toString.call(arg) === '[object Object]' && arg.constructor === Object;
};

/**
 *  Test if the argument is a string.
 *  @param {*} arg the argument to test
 *  @returns {boolean} true if the arg is a string
 */
function isString(arg) {
    return typeof arg === 'string';
};

///////////////////////////////////////////////////////////////////////////
// CONVERSIONS
///////////////////////////////////////////////////////////////////////////

function flatToSharp(note) {
  switch (note) {
    case 'Bb': return 'A#';
    case 'Db': return 'C#';
    case 'Eb': return 'D#';
    case 'Gb': return 'F#';
    case 'Ab': return 'G#';
    default:   return note;
  }
}

///////////////////////////////////////////////////////////////////////////
// HELPER FUNCTIONS
///////////////////////////////////////////////////////////////////////////

function getRandomIntInclusive(min, max) { 
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function noteValue(note, octave) {
  return octave * 12 + OCTAVE.indexOf(note);
}

function getNoteDistance(note1, octave1, note2, octave2) {
  return noteValue(note1, octave1) - noteValue(note2, octave2);
}

function getNearestSample(sampleBank, note, octave) {
  let sortedBank = sampleBank.slice().sort((sampleA, sampleB) => {
    let distanceToA =
      Math.abs(getNoteDistance(note, octave, sampleA.note, sampleA.octave));
    let distanceToB =
      Math.abs(getNoteDistance(note, octave, sampleB.note, sampleB.octave));
    return distanceToA - distanceToB;
  });
  return sortedBank[0];
}

/**
*  interpret the {object offsetObject} to get the offset and duration to be used at buffer playback
*  @param1 {object offsetObject} - an object with optional properties:
*  																		'array': [array [{float}]] (optional),
*  																		'random': {bool} (optional),
*  																		'offset': {int} or {float},
*  																		'duration': {int}.
*  If an array (of offset values) is provided in the offsetObject's 'array' property, any 'offset' value will be interpreted 
*  as an index to the offset values array (rounded to nearest integer and  clipped to array length).
*  If a boolean value is provided with 'random' key, any 'offset' value is disregarded and a random array index value will be used with
*  a 'duration' value set to the next array index value.  -> buffer will be played till the end }
*  
*  @returns {object {offset,duration} }
*/
function getOffset(offsetObject) {

  let offset = 0, duration = 0;

  if (!isUndef(offsetObject.array) && Array.isArray(offsetObject.array)) {
    let offset_index, dur_index;
    if (!isUndef(offsetObject.random) && typeof offsetObject.random === 'boolean' && offsetObject.random ) {
      offset_index = getRandomIntInclusive(0, offsetObject.array.length-1);
    } else { 
    	offset_index = Math.Round(offsetObject.offset);
    }

    if (offset_index < offsetObject.array.length-1) {
      dur_index = offset_index + 1;
      duration = offsetObject.array[dur_index] - offsetObject.array[offset_index];
    } else if (offset_index > offsetObject.array.length-1) {
      offset_index = offsetObject.array.length-1;
      duration = 0;
    } else {
      duration = 0;
    }

    offset = offsetObject.array[offset_index];

  } else {
    offset = offsetObject.offset;
    duration = Math.max(offsetObject.duration,0);
  }

  return {
    offset: offset,
    duration: duration
  }
}

function fetchSample(path) {
  return fetch(encodeURIComponent(path))
    .then(response => response.arrayBuffer() )
    .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer) );
}

/**
*  Fetch and decode ONE or MULTIPLE audio files who's names are passed in as a string, an array of strings, or (by omitting param2) in an object format
*  {'name': { name: 'string', clip_offsets: [], file: 'string', fetched: 'string' } }. If @param2 is omitted all the files 
*  referenced by the @param1 {object}'s 'file' properties will be fetched. Files just being fetched by an other instance of the fn 
*  or already fetched/decoded are not re-feched, instead the fn will wait until any 'inProgress' fetches are finished and return an object 
*  with an [array 'requestedClipsObjArr'] containing all the requested 'clipObjects' and the related [AudioBuffer 'decodedAudioData'] or [array [AudioBuffer 'decodedAudioData']].
*  @param1 {object} containing: a.) @param2 'clipNameArray' elements as keys, and 
*  								b.) object[element].file keys referencing the 'pathToFile' info
*  @param2 OPTIONAL [,{array or string}] - name(s) of file(s) required to be fetched/decoded given as either an array of strings 
*  								or a string addressing object's (@param1) own keyNames
*  @return {object [AudioBuffer 'decodedAudioData'] (or [array AudioBuffer 'decodedAudioData'] if multiple files requested), [array 'requestedClipsObjArr'] }
**/
function fetchAllSample(object,requestedClipNameArray) {

	return new Promise((resolve) => {
	
		let _requestedClipNameArray = [];
		let _bufferedClipsObjs = [];
		if (!isUndef(requestedClipNameArray) && isString(requestedClipNameArray)) {
			_requestedClipNameArray.push(requestedClipNameArray)
		} else {
			if (!isUndef(requestedClipNameArray) && Array.isArray(requestedClipNameArray)) {
				_requestedClipNameArray = requestedClipNameArray;
			} else if (isUndef(requestedClipNameArray)) {
				_requestedClipNameArray = Object.keys(object);
			}
		}

		let requestedClipsObjArr = [];
		
	    function getElsewhereFetchedData (elem) {
				return new Promise((resolve) => {
					resolve ( elem.promise );
				})
	    }
	    // get all promises from either fetchSample() (if .fetched === 'notStarted')) or from object[element].promise property 
	    // via getElsewhereFetchedData() (if .fetched === 'inProgress' || 'Complete' )
		Promise.all(_requestedClipNameArray.map((element) => {

			return new Promise((resolve) => {
			    if (object[element].fetched === 'notStarted') {
			    	let fetchPromise = fetchSample(object[element].file);
			    	object[element].fetched = 'inProgress';
			    	object[element].promise = fetchPromise; // get a reference of the pending promise and assign to object's 'promise' property
			    	resolve ( fetchPromise );

				} else if (object[element].fetched === 'inProgress' || 'Complete' ) {
				    getElsewhereFetchedData (object[element])
						.then( (storePromise) => {
							return new Promise((resolve) => {
								resolve ( storePromise );
							})
						})
						.then( (storePromise) => {
							resolve ( storePromise );
						})
				}
			})
		}))
	    	.then((decodedAudioData) => {
	    		_requestedClipNameArray.forEach((element, index) => {
					object[element].buffer = decodedAudioData[index];
					object[element].fetched === 'Complete';
					requestedClipsObjArr.push(object[element]);
				})

				let toBeReturned = {
						requestedClipsObjArr: requestedClipsObjArr
						}
				// return AudioBuffers either as an array of AudioBuffer objects or as a single AudioBuffer object depending on the number of requested clips
				if (requestedClipsObjArr.length > 1 ) {
					toBeReturned.decodedAudioData = [];
					requestedClipsObjArr.forEach( (requestedClipObj,index) => {
						toBeReturned.decodedAudioData[index] =	requestedClipObj.buffer;
					});
					
				} else if (requestedClipsObjArr.length == 1 ) {
					toBeReturned.decodedAudioData = requestedClipsObjArr[0].buffer;
				} 

				resolve( toBeReturned );
			})
	});
}


function getSample(instrument, noteAndOctave) {
  let [, requestedNote, requestedOctave] = /^(\w[b#]?)(\d)$/.exec(noteAndOctave);
  requestedOctave = parseInt(requestedOctave, 10);
  requestedNote = flatToSharp(requestedNote);

  let sampleBank = SAMPLE_LIBRARY[instrument];
  let sample = getNearestSample(sampleBank, requestedNote, requestedOctave);
  let distance =
    getNoteDistance(requestedNote, requestedOctave, sample.note, sample.octave);
  return fetchSample(sample.file).then(audioBuffer => ({
    audioBuffer: audioBuffer,
    distance: distance
  }));
}

function createBufferSource(audioBuffer, distance, destination) {
  let playbackRate = Math.pow(2, distance / 12);
  let bufferSource = audioContext.createBufferSource();
  bufferSource.buffer = audioBuffer;
  bufferSource.playbackRate.value = playbackRate;
  bufferSource.connect(destination);
  return bufferSource;
}

function playSample(instrument, note, destination, delaySeconds = 0) {
  getSample(instrument, note)
    .then(({audioBuffer, distance}) => {
      return createBufferSource(audioBuffer, distance, destination)
    })
    .then(bufferSource => 
      bufferSource.start(audioContext.currentTime + delaySeconds)
    );
}

/**
*  Play audio files in a flexible way just by providing the global/local dataObject and clipName. dataObject format should be {'name': { name: 'string'[, clip_offsets: [] ], file: 'string', fetched: 'string' } }.
*  The function internally uses fetchAllSample() thus calling multiple instances of this fn() simultaniously on the very same audio clip will result in all instances playing from the same buffer
*  Returns an audio precision callback/promise (wrapping AudioBufferSourceNode.onended) with the played AudioBufferSourceNode after the clip finished playin, so you can chain a .then() after the fn()
*  
*  @param1 {object}: global/local dataObject in a minimal format {'name': { name: 'string'[, clip_offsets: [] ], file: 'string', fetched: 'string' } }
*  @param2 {string}: name of the clipObject which is contained in the @param1 {object} global/local dataObject
*  @param3 OPTIONAL [,{float}] - set playbackRate in paricles of +/- semitones (Math.pow(2, distance / 12) ), default: 0
*  @param4 OPTIONAL [,{AudioNode}] - set a destination {AudioNode} for audio output, default: audioContext.destination
*  @param4 OPTIONAL [,{offsetObject}] - set offset and duration --- see info at getOffset(), default: {offset: 0,duration: 0} - clip played from beginning to end
*  @return {object [AudioBuffer 'decodedAudioData'] (or [array AudioBuffer 'decodedAudioData'] if multiple files requested), [array 'requestedClipsObjArr'] }
**/
function playBufferAtOffSet(dataObject, clipName, distance = 0, destination = audioContext.destination, 
	offsetObject = {offset: 0,duration: 0}, delaySeconds = 0) {

	return new Promise((resolve) => {
		let _audioBuffer, _offset, _duration;

		fetchAllSample(dataObject,clipName, id)
		.then(({decodedAudioData}) => {
		  let offs = getOffset(offsetObject);
		  _offset = offs.offset;
		  _duration = offs.duration;
		  return createBufferSource(decodedAudioData, distance, destination)
		})
		.then(bufferSource => {
			
			if (_duration <= 0) {
		    	bufferSource.start(audioContext.currentTime + delaySeconds, _offset)
		  	} else {
		  		bufferSource.start(audioContext.currentTime + delaySeconds, _offset, _duration)
		  	}

			bufferSource.onended = function(event) {
 				resolve(bufferSource);
			}
		});
	})
}

function startLoop(instrument, note, destination, loopLengthSeconds, delaySeconds) {
  playSample(instrument, note, destination, delaySeconds);
  setInterval(
    () => playSample(instrument, note, destination, delaySeconds),
    loopLengthSeconds * 1000
  );
}

// offset_duration_par object {array: array_name, random: 0/1, offset: 3, duration: -1 }
function startBufferLoop(dataObject, clipName, distance, destination, offsetObject, loopLengthSeconds, delaySeconds) {
  console.log("playBufferAtOffSet(dataObject"+","+clipName+","+distance+","+destination+","+offsetObject+","+delaySeconds+");");
  playBufferAtOffSet(dataObject, clipName, distance, destination, offsetObject, delaySeconds);
  setInterval(
    () => {
      playBufferAtOffSet(dataObject, clipName, distance, destination, offsetObject, delaySeconds)
    },
    loopLengthSeconds * 1000
  );
}

module.exports = {
  startBufferLoop: startBufferLoop,
  startLoop: startLoop,
  playBufferAtOffSet: playBufferAtOffSet,
  fetchSample: fetchSample,
  fetchAllSample: fetchAllSample,
  audioContext: audioContext,
  getRandomIntInclusive: getRandomIntInclusive
};
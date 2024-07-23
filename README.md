# ScoreHeap

 A heap optimized for frequent updates.
 Maintains a sorted list with partitions so only items within a modified partition need to be reindexed.
 Returns the highest score (int32) in the heap, else null if the heap is empty.

### Working Example

```js
import ScoreHeap from 'score-heap';

let objs = [];
let scores = [];

// make a million entries with score = array index
for (let i = 0; i < 1000000; ++i) {

	// this is the source array, the entries can be anything
	objs.push({ i });

	// initial scores will be passed into the new ScoreHeap below (a score must always be an int32)
	scores.push([i, i]);
}

// construct a ScoreHeap with objs scores and a max length
let heap = new ScoreHeap(scores, scores.length);

console.time();

// get the next highest scoring index and remove it, then update the next entry with a random score
// 1M next() + remove() + update() each
for (let i; (i = heap.next()) != null;) {

	heap.remove(i, objs[i].i);

	if (i < objs.length - 1) {
		heap.update(i + 1, Math.floor(Math.random() * objs.length));
	}
}

console.timeEnd();

// ScoreHeap does not care about your underlying data structure.
// Its only purpose is to make retrieving, updating, and removing scored array entries as fast as possible.

```

## Methods

### constructor(indexScores, maxLength)

Make a new ScoreHeap.

`indexScores` An array of [index, score] to build the heap from (score must be an int32)
`maxLength` The length of the underlying (unpassed) source array (must never expand beyond this value)

Returns a new ScoreHeap.

### next()

Get the highest scoring index.

Returns the index with the highest score in the heap.

### update(index, score)

Update an index in the heap (index does not have to be in the heap yet).
 
`index` Index to update (or insert)
`score` Score of the index (must be an int32)

### remove(index)

Remove an index from the heap.
 
`index` Index to remove

Returns the index passed in if successful, else undefined.

## Performance

...

## TODO

...

## Contributing

Feel free to make changes and submit pull requests whenever.

## License

ScoreHeap uses the [MIT](https://opensource.org/licenses/MIT) license.
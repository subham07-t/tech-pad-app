const Note = require("../models/Note");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");

/**
 * Get all notes
 * @route GET /notes
 * @access Private
 */

const getAllNotes = asyncHandler(async (req, res) => {
  // Get all notes from MongoDB
  const notes = await Note.find().lean();

  // If no notes
  if (!notes?.length) {
    return res.status(400).json({ message: "No notes found" });
  }

  // Add username to each note before sending the response
  const notesWithUser = await Promise.all(
    notes.map(async (note) => {
      const user = await User.findById(note.user).lean().exec();
      return { ...note, username: user.username };
    })
  );
  res.json(notesWithUser);
});

/**
 * Create new note
 * @route POST /notes
 * @access Private
 */

const createNewNote = asyncHandler(async (req, res) => {
  const { user, title, text } = req.body;

  // Confirm data
  if (!user || !title || !text) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // Check for duplicate title
  const duplicate = await Note.findOne({ title })
    .collation({ locale: "en", strength: 2 })
    .lean()
    .exec();

  if (duplicate) {
    return res.status(409).json({ message: "Duplicate note title" });
  }

  // Get the latest note to determine the ticket/serial number
  const latestNote = await Note.findOne(
    {},
    {},
    { sort: { ticket: -1 } }
  ).lean();

  // Calculate the ticket/serial number
  const ticket = latestNote ? latestNote.ticket + 1 : 1;

  // Create and store the new user
  const note = await Note.create({ user, title, text, ticket });

  if (note) {
    // Created
    return res.status(201).json({ message: "New note created" });
  } else {
    return res.status(400).json({ message: "Invalid note data received" });
  }
});

/**
 * Update a note
 * @route PATCH /notes
 * @access Private
 */

const updateNote = asyncHandler(async (req, res) => {
  const { id, user, title, text, completed } = req.body;

  // Confirm data
  if (!id || !user || !title || !text || typeof completed !== "boolean") {
    return res.status(400).json({ message: "All fields are required" });
  }

  // Confirm note exists to update
  const note = await Note.findById(id).exec();

  if (!note) {
    return res.status(400).json({ message: "Note not found" });
  }

  // Check for duplicate title
  const duplicate = await Note.findOne({ title })
    .collation({ locale: "en", strength: 2 })
    .lean()
    .exec();

  // Allow renaming of the original note
  if (duplicate && duplicate?._id.toString() !== id) {
    return res.status(409).json({ message: "Duplicate note title" });
  }

  note.user = user;
  note.title = title;
  note.text = text;
  note.completed = completed;

  const updatedNote = await note.save();

  res.json(`'${updatedNote.title}' updated`);
});

/**
 * @desc Delete a note
 * @route DELETE /notes
 * @access Private
 */

const deleteNote = asyncHandler(async (req, res) => {
  const { id } = req.body;

  // Confirm data
  if (!id) {
    return res.status(400).json({ message: "Note ID required" });
  }

  // Confirm note exists to delete
  const note = await Note.findById(id).exec();

  if (!note) {
    return res.status(400).json({ message: "Note not found" });
  }

  // Get the ticket number of the note to be deleted
  const deletedTicket = note.ticket;

  const result = await note.deleteOne();

  // Reorder the ticket numbers of the remaining notes
  const remainingNotes = await Note.find({
    ticket: { $gt: deletedTicket },
  }).exec();

  for (let i = 0; i < remainingNotes.length; i++) {
    remainingNotes[i].ticket -= 1;
    await remainingNotes[i].save();
  }

  const reply = `Note '${result.title}' with ID ${result._id} deleted`;

  res.json(reply);
});

module.exports = {
  getAllNotes,
  createNewNote,
  updateNote,
  deleteNote,
};

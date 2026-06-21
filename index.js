const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const Stripe = require('stripe');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

app.get('/', (req, res) => {
    res.send('Fable Server is Running!')
});

async function run() {
    try {
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

        const database = client.db(process.env.DB_NAME);
        const ebooksCollection = database.collection("ebooks");
        const purchasesCollection = database.collection("purchases");
        const bookmarksCollection = database.collection("bookmarks");

        // Books By Genre + All Books (single route, age duibar declare chilo)
        app.get('/ebooks', async (req, res) => {
            try {
                const { genre } = req.query;
                let query = {};

                if (genre) {
                    // Case-Insensitive Match (Regex)
                    query.category = { $regex: new RegExp(`^${genre}$`, 'i') };
                }

                const books = await ebooksCollection.find(query).toArray();
                res.status(200).json(books);
            } catch (error) {
                console.error("Error fetching books:", error);
                res.status(500).json({ error: "Server error" });
            }
        });

        // Ebooks Details ( ObjectId)
        app.get('/ebooks/:id', async (req, res) => {
            try {
                const bookId = req.params.id;

                if (!ObjectId.isValid(bookId)) {
                    return res.status(400).json({ error: "Invalid book id" });
                }

                const book = await ebooksCollection.findOne({ _id: new ObjectId(bookId) });

                if (!book) {
                    return res.status(404).json({ error: "Book not found" });
                }
                res.status(200).json(book);
            } catch (error) {
                console.error("Error fetching book detail:", error);
                res.status(500).json({ error: "Server error" });
            }
        });

        // ==========================================
        //          STRIPE CHECKOUT & PURCHASE
        // ==========================================

        // Checkout Session Details (Success )
        app.get('/checkout-session/:sessionId', async (req, res) => {
            try {
                const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
                res.status(200).json({
                    paymentStatus: session.payment_status,
                    customerEmail: session.customer_details?.email,
                    amountTotal: session.amount_total / 100,
                    ebookId: session.metadata?.ebookId,
                    buyerId: session.metadata?.buyerId,
                });
            } catch (error) {
                console.error("Error retrieving checkout session:", error);
                res.status(500).json({ error: "Failed to retrieve session" });
            }
        });

        // Purchase Save (Without webhook From SuccessPage)
        app.post('/save-purchase', async (req, res) => {
            try {
                const { ebookId, buyerId, buyerEmail, stripeSessionId, amount } = req.body;

                if (!ebookId || !stripeSessionId) {
                    return res.status(400).json({ error: "ebookId and stripeSessionId are required" });
                }

                if (!ObjectId.isValid(ebookId)) {
                    return res.status(400).json({ error: "Invalid book id" });
                }

                // Duplicate prevent 
                const existing = await purchasesCollection.findOne({ stripeSessionId });
                if (existing) {
                    return res.status(200).json({ success: true, note: "already saved", purchase: existing });
                }

                const ebook = await ebooksCollection.findOne({ _id: new ObjectId(ebookId) });
                if (!ebook) {
                    return res.status(404).json({ error: "Book not found" });
                }

                const newPurchase = {
                    ebookId: new ObjectId(ebookId),
                    ebookTitle: ebook.title,
                    buyerId: buyerId || "guest",
                    buyerEmail: buyerEmail || "",
                    writerId: ebook.writerId || "",
                    amount: amount || ebook.price,
                    stripeSessionId,
                    status: "completed",
                    purchaseDate: new Date(),
                };

                await purchasesCollection.insertOne(newPurchase);

                await ebooksCollection.updateOne(
                    { _id: new ObjectId(ebookId) },
                    { $set: { isSold: true } }
                );

                res.status(201).json({ success: true, purchase: newPurchase });
            } catch (error) {
                console.error("Error saving purchase:", error);
                res.status(500).json({ error: "Failed to save purchase" });
            }
        });

        //Error Handling If no book yet purchased
        // app.get('/user/purchased', async (req, res) => {
        //     try {
        //         const { userId } = req.query;
        //         if (!userId) return res.status(200).json([]);

        //         const purchases = await purchasesCollection.find({ buyerId: userId }).toArray();
        //         res.status(200).json(purchases);

        //     } catch (error) {
        //         console.error("Error fetching purchases:", error);
        //         res.status(500).json({ error: "Internal Server Error" });
        //     }
        // });
        app.get('/user/purchased', async (req, res) => {
            try {
                const { userId } = req.query;
                if (!userId) return res.status(200).json([]);

                const purchases = await purchasesCollection
                    .find({ buyerId: userId })
                    .sort({ purchaseDate: -1 })
                    .toArray();

                // Purchase full book details
                const purchasesWithBooks = await Promise.all(
                    purchases.map(async (purchase) => {
                        const book = await ebooksCollection.findOne({ _id: purchase.ebookId });
                        return {
                            ...purchase,
                            book: book || null,
                        };
                    })
                );

                res.status(200).json(purchasesWithBooks);
            } catch (error) {
                console.error("Error fetching purchases:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        //Purchase History (real data)
        app.get('/user/history', async (req, res) => {
            try {
                const { userId } = req.query;
                if (!userId) return res.status(200).json([]);

                const history = await purchasesCollection
                    .find({ buyerId: userId })
                    .sort({ purchaseDate: -1 })
                    .toArray();

                res.status(200).json(history);
            } catch (error) {
                console.error("Error fetching history:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        //User Bookmark Add or Delete

        //  (GET)
        // app.get('/user/bookmarks', async (req, res) => {
        //     try {

        //         const dummyBookmarks = [
        //             {
        //                 _id: "b_bookmark_01",
        //                 userId: "user_123",
        //                 book: {
        //                     _id: "64f1a2b3c4d5e6f7a8b9c001", //  MongoDB ObjectId 
        //                     title: "The Great Gatsby",
        //                     author: "F. Scott Fitzgerald",
        //                     coverImage: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=500"
        //                 }
        //             },
        //             {
        //                 _id: "b_bookmark_02",
        //                 userId: "user_123",
        //                 book: {
        //                     _id: "64f1a2b3c4d5e6f7a8b9c002",
        //                     title: "Sci-Fi Chronicles",
        //                     author: "H. G. Wells",
        //                     coverImage: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500"
        //                 }
        //             }
        //         ];

        //         // Test dummy bookmarks const dummyBookmarks = [];
        //         res.status(200).json(dummyBookmarks);

        //     } catch (error) {
        //         console.error("Error fetching bookmarks:", error);
        //         res.status(500).json({ error: "Internal Server Error" });
        //     }
        // });

        // //  (DELETE)
        // app.delete('/user/bookmarks/:id', async (req, res) => {
        //     try {
        //         const bookmarkId = req.params.id;
        //         console.log(`Request to delete bookmark ID: ${bookmarkId}`);

        //         /*  MongoDB Connection
        //         const result = await bookmarksCollection.deleteOne({ _id: new ObjectId(bookmarkId) });
        //         */

        //         res.status(200).json({ success: true, message: "Bookmark removed successfully" });

        //     } catch (error) {
        //         console.error("Error deleting bookmark:", error);
        //         res.status(500).json({ error: "Internal Server Error" });
        //     }
        // });
        //Updated
        // Bookmark Add (POST)
        app.post('/user/bookmarks', async (req, res) => {
            try {
                const { userId, ebookId } = req.body;

                if (!userId || !ebookId) {
                    return res.status(400).json({ error: "userId and ebookId are required" });
                }
                if (!ObjectId.isValid(ebookId)) {
                    return res.status(400).json({ error: "Invalid book id" });
                }

                const existing = await bookmarksCollection.findOne({ userId, ebookId: new ObjectId(ebookId) });
                if (existing) {
                    return res.status(200).json({ success: true, note: "already bookmarked" });
                }

                const newBookmark = {
                    userId,
                    ebookId: new ObjectId(ebookId),
                    createdAt: new Date(),
                };

                const result = await bookmarksCollection.insertOne(newBookmark);
                res.status(201).json({ success: true, bookmarkId: result.insertedId });
            } catch (error) {
                console.error("Error adding bookmark:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // Bookmark List (GET) - full book details shoho
        app.get('/user/bookmarks', async (req, res) => {
            try {
                const { userId } = req.query;
                if (!userId) return res.status(200).json([]);

                const bookmarks = await bookmarksCollection.find({ userId }).toArray();

                const bookmarksWithBooks = await Promise.all(
                    bookmarks.map(async (bm) => {
                        const book = await ebooksCollection.findOne({ _id: bm.ebookId });
                        return { ...bm, book: book || null };
                    })
                );

                res.status(200).json(bookmarksWithBooks);
            } catch (error) {
                console.error("Error fetching bookmarks:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // Bookmark Remove (DELETE)
        app.delete('/user/bookmarks/:id', async (req, res) => {
            try {
                const bookmarkId = req.params.id;
                if (!ObjectId.isValid(bookmarkId)) {
                    return res.status(400).json({ error: "Invalid bookmark id" });
                }

                await bookmarksCollection.deleteOne({ _id: new ObjectId(bookmarkId) });
                res.status(200).json({ success: true, message: "Bookmark removed successfully" });
            } catch (error) {
                console.error("Error deleting bookmark:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });



        //User Profile

        //  User Profile Data(GET)
        // app.get('/user/profile', async (req, res) => {
        //     try {
        //         /* For JWT Authentication Logic:
        //         const userId = req.user.id;
        //         const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
        //         */

        //         // Dummy Data
        //         const dummyUser = {
        //             _id: "user_123",
        //             name: "John Doe",
        //             email: "johndoe@example.com",
        //             createdAt: "2026-06-20T12:00:00.000Z"
        //         };

        //         res.status(200).json(dummyUser);
        //     } catch (error) {
        //         console.error("Error fetching profile:", error);
        //         res.status(500).json({ error: "Internal Server Error" });
        //     }
        // });

        // // User Profile Data Update
        // app.put('/user/profile', async (req, res) => {
        //     try {
        //         const { name } = req.body; // User Name
        //         console.log(`Updating profile name to: ${name}`);

        //         /* For Database:
        //         const userId = req.user.id;
        //         const result = await usersCollection.updateOne(
        //             { _id: new ObjectId(userId) },
        //             { $set: { name: name } }
        //         );
        //         */

        //         res.status(200).json({ success: true, message: "Profile updated successfully" });
        //     } catch (error) {
        //         console.error("Error updating profile:", error);
        //         res.status(500).json({ error: "Internal Server Error" });
        //     }
        // });

        //Writer

        // (GET)
        // app.get('/writer/my-books', async (req, res) => {
        //     try {
        //         /*  JWT Authentication Logic
        //         const writerId = req.user.id; // Logged in writer ID
        //         const myBooks = await ebooksCollection.find({ writerId: writerId }).toArray();
        //         */

        //         // DummyBooks
        //         const dummyWriterBooks = [
        //             {
        //                 _id: "book_writer_01",
        //                 title: "The Silent Echoes",
        //                 category: "Mystery",
        //                 price: 12.50,
        //                 rating: 4.8,
        //                 coverImage: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=500",
        //                 status: "approved",
        //                 writerId: "writer_123"
        //             },
        //             {
        //                 _id: "book_writer_02",
        //                 title: "Shadows of Tomorrow",
        //                 category: "Sci-Fi",
        //                 price: 8.99,
        //                 rating: 0.0,
        //                 coverImage: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500",
        //                 status: "pending",
        //                 writerId: "writer_123"
        //             }
        //         ];


        //         res.status(200).json(dummyWriterBooks);

        //     } catch (error) {
        //         console.error("Error fetching writer books:", error);
        //         res.status(500).json({ error: "Internal Server Error" });
        //     }
        // });

        // // Writer (DELETE)
        // app.delete('/writer/books/:id', async (req, res) => {
        //     try {
        //         const bookId = req.params.id;
        //         console.log(`Request to delete book ID by writer: ${bookId}`);

        //         /*  MongoDB Operation Logic:
        //         const result = await ebooksCollection.deleteOne({ _id: new ObjectId(bookId) });
        //         */

        //         res.status(200).json({ success: true, message: "Ebook deleted successfully" });

        //     } catch (error) {
        //         console.error("Error deleting book by writer:", error);
        //         res.status(500).json({ error: "Internal Server Error" });
        //     }
        // });

        // // Writer Book Details GET
        // app.get('/writer/books/:id', async (req, res) => {
        //     try {
        //         const bookId = req.params.id;

        //         /* Database Integration:
        //         const book = await ebooksCollection.findOne({ _id: new ObjectId(bookId) });
        //         */

        //         // Dummy Books Details
        //         const dummyBookDetails = {
        //             _id: bookId,
        //             title: "The Silent Echoes",
        //             category: "Mystery",
        //             price: 12.50
        //         };

        //         res.status(200).json(dummyBookDetails);
        //     } catch (error) {
        //         console.error("Error fetching book details:", error);
        //         res.status(500).json({ error: "Internal Server Error" });
        //     }
        // });

        // // Writer Book Info Update (PUT)
        // app.put('/writer/books/:id', async (req, res) => {
        //     try {
        //         const bookId = req.params.id;
        //         const { title, category, price } = req.body;

        //         console.log(`Updating Book ID ${bookId} with data:`, { title, category, price });

        //         /* Database Logic
        //         const result = await ebooksCollection.updateOne(
        //             { _id: new ObjectId(bookId) },
        //             { $set: { title, category, price, status: 'pending' } } 
        //             // Status 'pending' (bookEdit)
        //         );
        //         */

        //         res.status(200).json({ success: true, message: "Book updated successfully" });
        //     } catch (error) {
        //         console.error("Error updating book details:", error);
        //         res.status(500).json({ error: "Internal Server Error" });
        //     }
        // });

        // //Writer POST Books

        // // Writer NEW Book Upload (POST)
        // app.post('/writer/books', async (req, res) => {
        //     try {
        //         const { title, category, price, coverImage } = req.body;

        //         // Database Object
        //         const newEbook = {
        //             title,
        //             category,
        //             price: Number(price),
        //             coverImage,
        //             rating: 0.0,
        //             status: "pending",
        //             createdAt: new Date(),
        //             writerId: "writer_123"
        //         };

        //         console.log("Saving new ebook to database:", newEbook);

        //         /* MONGODB Collection
        //         const result = await ebooksCollection.insertOne(newEbook);
        //         */

        //         //
        //         res.status(201).json({
        //             success: true,
        //             message: "Ebook uploaded successfully and is pending for review."
        //         });

        //     } catch (error) {
        //         console.error("Error creating new ebook:", error);
        //         res.status(500).json({ error: "Internal Server Error" });
        //     }
        // });

        // //Writer Sales History

        // // Writer Sales (GET)
        // app.get('/writer/sales-report', async (req, res) => {
        //     try {
        //         /*  JWT and MongoDB (Aggregation):
        //         const writerId = req.user.id;

        //         // purchases Collection (Only Writer Books)
        //         const history = await purchasesCollection.find({ writerId: writerId }).sort({ purchaseDate: -1 }).toArray();

        //         // Total Revenue এবং Sales Count Logic
        //         const totalCopiesSold = history.length;
        //         const totalRevenue = history.reduce((sum, item) => sum + item.amount, 0);
        //         */

        //         // Project Test 
        //         const dummySalesReport = {
        //             stats: {
        //                 totalRevenue: 238.89,
        //                 totalCopiesSold: 19,
        //                 thisMonthRevenue: 48.97
        //             },
        //             history: [
        //                 {
        //                     _id: "sale_001",
        //                     bookTitle: "The Silent Echoes",
        //                     purchaseDate: "2026-06-19T10:15:30.000Z",
        //                     buyerId: "user_buyer_999a",
        //                     amount: 12.50
        //                 },
        //                 {
        //                     _id: "sale_002",
        //                     bookTitle: "The Silent Echoes",
        //                     purchaseDate: "2026-06-14T16:45:00.000Z",
        //                     buyerId: "user_buyer_888b",
        //                     amount: 12.50
        //                 },
        //                 {
        //                     _id: "sale_003",
        //                     bookTitle: "Shadows of Tomorrow",
        //                     purchaseDate: "2026-06-02T05:20:10.000Z",
        //                     buyerId: "user_buyer_777c",
        //                     amount: 8.99
        //                 }
        //             ]
        //         };

        //         // Dummy Sales Test
        //         // const dummySalesReport = { stats: { totalRevenue: 0, totalCopiesSold: 0, thisMonthRevenue: 0 }, history: [] };

        //         res.status(200).json(dummySalesReport);

        //     } catch (error) {
        //         console.error("Error generating sales report:", error);
        //         res.status(500).json({ error: "Internal Server Error" });
        //     }
        // });

        // //Writer Bookmarks
        // // Writer BookMark List (GET)
        // app.get('/writer/bookmarks', async (req, res) => {
        //     try {
        //         /* Database Integration Logic:
        //         const writerId = req.user.id;
        //         const bookmarks = await bookmarksCollection.find({ userId: writerId }).toArray();
        //         */

        //         // Dummy Data
        //         const dummyWriterBookmarks = [
        //             {
        //                 _id: "wb_01",
        //                 userId: "writer_123",
        //                 book: {
        //                     _id: "64f1a2b3c4d5e6f7a8b9c991",
        //                     title: "The Art of Fiction",
        //                     author: "John Gardner",
        //                     coverImage: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=500"
        //                 }
        //             },
        //             {
        //                 _id: "wb_02",
        //                 userId: "writer_123",
        //                 book: {
        //                     _id: "64f1a2b3c4d5e6f7a8b9c992",
        //                     title: "Storytelling Masterclass",
        //                     author: "Robert McKee",
        //                     coverImage: "https://images.unsplash.com/photo-1476275466078-4007374efbbe?w=500"
        //                 }
        //             }
        //         ];

        //         res.status(200).json(dummyWriterBookmarks);
        //     } catch (error) {
        //         console.error("Error fetching writer bookmarks:", error);
        //         res.status(500).json({ error: "Internal Server Error" });
        //     }
        // });

        // // Writer BookMarks (DELETE)
        // app.delete('/writer/bookmarks/:id', async (req, res) => {
        //     try {
        //         const bookmarkId = req.params.id;
        //         console.log(`Deleting writer bookmark ID: ${bookmarkId}`);

        //         /* Database Code
        //         const result = await bookmarksCollection.deleteOne({ _id: new ObjectId(bookmarkId) });
        //         */

        //         res.status(200).json({ success: true, message: "Bookmark removed successfully" });
        //     } catch (error) {
        //         console.error("Error deleting writer bookmark:", error);
        //         res.status(500).json({ error: "Internal Server Error" });
        //     }
        // });
        //Writer Updated
        // Writer's own books (GET)
        app.get('/writer/my-books', async (req, res) => {
            try {
                const { writerId } = req.query;
                if (!writerId) return res.status(200).json([]);

                const myBooks = await ebooksCollection
                    .find({ writerId })
                    .sort({ createdAt: -1 })
                    .toArray();

                res.status(200).json(myBooks);
            } catch (error) {
                console.error("Error fetching writer books:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // Writer Book Details (GET)
        app.get('/writer/books/:id', async (req, res) => {
            try {
                const bookId = req.params.id;
                if (!ObjectId.isValid(bookId)) {
                    return res.status(400).json({ error: "Invalid book id" });
                }

                const book = await ebooksCollection.findOne({ _id: new ObjectId(bookId) });
                if (!book) {
                    return res.status(404).json({ error: "Book not found" });
                }

                res.status(200).json(book);
            } catch (error) {
                console.error("Error fetching book details:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // Writer New Book Upload (POST)
        app.post('/writer/books', async (req, res) => {
            try {
                const { title, category, price, coverImage, description, writerId, writerName } = req.body;

                if (!title || !category || !price || !writerId) {
                    return res.status(400).json({ error: "title, category, price and writerId are required" });
                }

                const newEbook = {
                    title,
                    category,
                    description: description || "",
                    price: Number(price),
                    coverImage: coverImage || "",
                    rating: 0,
                    status: "published", // admin approval na thakle directly published
                    isSold: false,
                    writerId,
                    writerName: writerName || "Unknown",
                    createdAt: new Date(),
                };

                const result = await ebooksCollection.insertOne(newEbook);
                res.status(201).json({
                    success: true,
                    message: "Ebook uploaded successfully.",
                    bookId: result.insertedId,
                });
            } catch (error) {
                console.error("Error creating new ebook:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // Writer Book Update (PUT)
        app.put('/writer/books/:id', async (req, res) => {
            try {
                const bookId = req.params.id;
                const { title, category, price, coverImage, description } = req.body;

                if (!ObjectId.isValid(bookId)) {
                    return res.status(400).json({ error: "Invalid book id" });
                }

                const updateFields = {};
                if (title !== undefined) updateFields.title = title;
                if (category !== undefined) updateFields.category = category;
                if (price !== undefined) updateFields.price = Number(price);
                if (coverImage !== undefined) updateFields.coverImage = coverImage;
                if (description !== undefined) updateFields.description = description;

                const result = await ebooksCollection.updateOne(
                    { _id: new ObjectId(bookId) },
                    { $set: updateFields }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ error: "Book not found" });
                }

                res.status(200).json({ success: true, message: "Book updated successfully" });
            } catch (error) {
                console.error("Error updating book details:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // Writer Book Delete (DELETE)
        app.delete('/writer/books/:id', async (req, res) => {
            try {
                const bookId = req.params.id;
                if (!ObjectId.isValid(bookId)) {
                    return res.status(400).json({ error: "Invalid book id" });
                }

                await ebooksCollection.deleteOne({ _id: new ObjectId(bookId) });
                res.status(200).json({ success: true, message: "Ebook deleted successfully" });
            } catch (error) {
                console.error("Error deleting book by writer:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // Writer Sales Report (GET) - real data from purchasesCollection
        app.get('/writer/sales-report', async (req, res) => {
            try {
                const { writerId } = req.query;
                if (!writerId) {
                    return res.status(200).json({ stats: { totalRevenue: 0, totalCopiesSold: 0, thisMonthRevenue: 0 }, history: [] });
                }

                const history = await purchasesCollection
                    .find({ writerId })
                    .sort({ purchaseDate: -1 })
                    .toArray();

                const totalRevenue = history.reduce((sum, item) => sum + (item.amount || 0), 0);
                const totalCopiesSold = history.length;

                const now = new Date();
                const thisMonthRevenue = history
                    .filter((item) => {
                        const d = new Date(item.purchaseDate);
                        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                    })
                    .reduce((sum, item) => sum + (item.amount || 0), 0);

                const formattedHistory = history.map((item) => ({
                    _id: item._id,
                    bookTitle: item.ebookTitle,
                    purchaseDate: item.purchaseDate,
                    buyerId: item.buyerId,
                    amount: item.amount,
                }));

                res.status(200).json({
                    stats: { totalRevenue, totalCopiesSold, thisMonthRevenue },
                    history: formattedHistory,
                });
            } catch (error) {
                console.error("Error generating sales report:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // Writer Bookmarks (GET) 
        app.get('/writer/bookmarks', async (req, res) => {
            try {
                const { writerId } = req.query;
                if (!writerId) return res.status(200).json([]);

                const bookmarks = await bookmarksCollection.find({ userId: writerId }).toArray();

                const bookmarksWithBooks = await Promise.all(
                    bookmarks.map(async (bm) => {
                        const book = await ebooksCollection.findOne({ _id: bm.ebookId });
                        return { ...bm, book: book || null };
                    })
                );

                res.status(200).json(bookmarksWithBooks);
            } catch (error) {
                console.error("Error fetching writer bookmarks:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // Writer Bookmarks (DELETE) - bookmarksCollection shared
        app.delete('/writer/bookmarks/:id', async (req, res) => {
            try {
                const bookmarkId = req.params.id;
                if (!ObjectId.isValid(bookmarkId)) {
                    return res.status(400).json({ error: "Invalid bookmark id" });
                }

                await bookmarksCollection.deleteOne({ _id: new ObjectId(bookmarkId) });
                res.status(200).json({ success: true, message: "Bookmark removed successfully" });
            } catch (error) {
                console.error("Error deleting writer bookmark:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // ==========================================
        //         ADMIN USER MANAGEMENT ROUTES
        // ==========================================

        // All User List (GET)
        app.get('/admin/users', async (req, res) => {
            try {
                /* Database Code:
                // Only Admin (Admin Verification Middleware)
                const allUsers = await usersCollection.find({}).toArray();
                */

                // Test DummyUsers
                const dummyUsers = [
                    {
                        _id: "user_001",
                        name: "ABC",
                        email: "abc@example.com",
                        role: "user"
                    },
                    {
                        _id: "writer_123",
                        name: "PQR",
                        email: "pqr@example.com",
                        role: "writer"
                    },
                    {
                        _id: "user_003",
                        name: "XYZ",
                        email: "xyz@example.com",
                        role: "admin"
                    }
                ];

                res.status(200).json(dummyUsers);
            } catch (error) {
                console.error("Error fetching users for admin:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // User Role Change Route (PUT)
        app.put('/admin/users/:id/role', async (req, res) => {
            try {
                const userId = req.params.id;
                const { role } = req.body;

                console.log(`Admin requested to change User ID: ${userId} role to: ${role}`);

                /* MongoDB Operation Logic
                const result = await usersCollection.updateOne(
                    { _id: new ObjectId(userId) },
                    { $set: { role: role } }
                );
                */

                res.status(200).json({ success: true, message: "User role updated successfully" });
            } catch (error) {
                console.error("Error updating user role by admin:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // User Account Delete (DELETE)
        app.delete('/admin/users/:id', async (req, res) => {
            try {
                const userId = req.params.id;
                console.log(`Admin requested to delete User ID: ${userId}`);

                /* MongoDB Operation Logic
                const result = await usersCollection.deleteOne({ _id: new ObjectId(userId) });
                */

                res.status(200).json({ success: true, message: "User account deleted successfully" });
            } catch (error) {
                console.error("Error deleting user by admin:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // ==========================================
        //          ADMIN EBOOK MANAGEMENT ROUTES
        // ==========================================

        // System Book List (GET)
        app.get('/admin/ebooks', async (req, res) => {
            try {
                /* Database Code:
                // Catalog Book (Approved, Pending, Rejected) Search
                const allBooks = await ebooksCollection.find({}).sort({ createdAt: -1 }).toArray();
                */

                // Dummy Catalog
                const dummyCatalog = [
                    {
                        _id: "book_writer_01",
                        title: "The Silent Echoes",
                        category: "Mystery",
                        price: 12.50,
                        coverImage: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=500",
                        status: "approved",
                        writerId: "writer_123"
                    },
                    {
                        _id: "book_writer_02",
                        title: "Shadows of Tomorrow",
                        category: "Sci-Fi",
                        price: 8.99,
                        coverImage: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500",
                        status: "pending",
                        writerId: "writer_123"
                    },
                    {
                        _id: "book_writer_03",
                        title: "Unpublished Draft Secrets",
                        category: "History",
                        price: 15.00,
                        coverImage: "",
                        status: "rejected",
                        writerId: "writer_456"
                    }
                ];

                res.status(200).json(dummyCatalog);
            } catch (error) {
                console.error("Error fetching catalog for admin:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // Book Status Change (PUT) -> Approve / Reject
        app.put('/admin/ebooks/:id/status', async (req, res) => {
            try {
                const bookId = req.params.id;
                const { status } = req.body; // 'approved' or 'rejected'

                console.log(`Admin updated Book ID: ${bookId} status to: ${status}`);

                /* MongoDB Operation Logic
                const result = await ebooksCollection.updateOne(
                    { _id: new ObjectId(bookId) },
                    { $set: { status: status } }
                );
                */

                res.status(200).json({ success: true, message: `Book status updated to ${status}` });
            } catch (error) {
                console.error("Error updating book status by admin:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // Book Delete From System (DELETE)
        app.delete('/admin/ebooks/:id', async (req, res) => {
            try {
                const bookId = req.params.id;
                console.log(`Admin requested to permanently delete Book ID: ${bookId}`);

                /* MongoDB Logic
                const result = await ebooksCollection.deleteOne({ _id: new ObjectId(bookId) });
                */

                res.status(200).json({ success: true, message: "Book deleted permanently from system" });
            } catch (error) {
                console.error("Error deleting book by admin:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });


        // ==========================================
        //          ADMIN TRANSACTION ROUTES
        // ==========================================

        // Transaction History (GET)
        app.get('/admin/transactions', async (req, res) => {
            try {
                /* Databse Integration
                // Transaction History Sort
                const history = await transactionsCollection.find({}).sort({ date: -1 }).toArray();
                */

                // Dummy Transactions
                const dummyTransactions = [
                    {
                        _id: "tx_001",
                        transactionId: "TXN-893A-K92",
                        type: "purchase",             // Reader Buy Books
                        email: "buyer.reader@example.com",
                        amount: 12.50,
                        date: "2026-06-20T14:22:00.000Z"
                    },
                    {
                        _id: "tx_002",
                        transactionId: "TXN-411B-L05",
                        type: "publishing fee",       // Writer Publishing fee
                        email: "famous.writer@example.com",
                        amount: 25.00,
                        date: "2026-06-19T09:11:00.000Z"
                    },
                    {
                        _id: "tx_003",
                        transactionId: "TXN-772C-P94",
                        type: "purchase",
                        email: "another.reader@example.com",
                        amount: 8.99,
                        date: "2026-06-18T18:45:30.000Z"
                    }
                ];

                res.status(200).json(dummyTransactions);
            } catch (error) {
                console.error("Error generating transaction ledger:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });


        // ==========================================
        //        ADMIN ANALYTICS & CHARTS API
        // ==========================================

        app.get('/admin/analytics', async (req, res) => {
            try {
                // ==============================================================
                // Option A :  (MongoDB) Logic 
                // ==============================================================
                /*
                // Monthly Sales Collection (Transaction Collection)
                const salesData = await transactionsCollection.aggregate([
                    { $match: { type: 'purchase' } }, // Sales Data Filter
                    {
                        $group: {
                            _id: { $month: "$date" }, // group by month
                            sales: { $sum: "$amount" } 
                        }
                    },
                    { $sort: { _id: 1 } } //  (Jan, Feb...)
                ]).toArray();
        
                // Month Conversion (1, 2) -> (Jan, Feb) Logic
        
                //  Book By Category (E book Collection)
                const genreData = await ebooksCollection.aggregate([
                    {
                        $group: {
                            _id: "$genre", // Category by genre
                            value: { $sum: 1 } 
                        }
                    },
                    {
                        $project: {
                            name: "$_id", // Recharts-'_id'->'name' 
                            value: 1,
                            _id: 0
                        }
                    }
                ]).toArray();
        
                // 
                // return res.status(200).json({ sales: formattedSalesData, genres: genreData });
                */


                // ==============================================================
                // Option B: Dummy Data (FrontEnd test)
                // ==============================================================
                const dummyAnalytics = {
                    // Bar Chart
                    sales: [
                        { month: 'Jan', sales: 1200 },
                        { month: 'Feb', sales: 1900 },
                        { month: 'Mar', sales: 1500 },
                        { month: 'Apr', sales: 2800 },
                        { month: 'May', sales: 3200 },
                        { month: 'Jun', sales: 4100 },
                        { month: 'Jul', sales: 3800 }
                    ],
                    // Pie Chart
                    genres: [
                        { name: 'Mystery & Thriller', value: 145 },
                        { name: 'Science Fiction', value: 98 },
                        { name: 'Romance', value: 120 },
                        { name: 'Biography', value: 65 },
                        { name: 'Self-Help', value: 54 }
                    ]
                };

                res.status(200).json(dummyAnalytics);

            } catch (error) {
                console.error("Error generating admin analytics:", error);
                res.status(500).json({ error: "Failed to load visual reports" });
            }
        });

    } catch (error) {
        console.error("Database connection failed:", error);
    }
}
run().catch(console.dir);

app.listen(PORT, () => {
    console.log(`Fable Server listening on port ${PORT}`);
});
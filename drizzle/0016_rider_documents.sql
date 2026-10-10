CREATE TABLE "rider_documents" (
	"document_id" serial PRIMARY KEY NOT NULL,
	"rider_id" integer NOT NULL,
	"document_type" varchar(40) NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"content_type" varchar(40) NOT NULL,
	"file_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "rider_documents_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "rider_documents_type_unique" UNIQUE("rider_id","document_type")
);
--> statement-breakpoint
ALTER TABLE "rider_documents" ADD CONSTRAINT "rider_documents_rider_id_riders_rider_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("rider_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rider_documents_rider_idx" ON "rider_documents" USING btree ("rider_id");
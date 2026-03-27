-- Run this in the Supabase SQL Editor to initialize your tables!

-- Create Users Table
CREATE TABLE users (
  id serial primary key,
  email text unique not null,
  password text not null,
  created_at timestamp with time zone default now()
);

-- Create Contractor Data Table
CREATE TABLE contractor_data (
  id serial primary key,
  plant_name text not null,
  section text not null,
  material text,
  length real,
  width real,
  pit_depth real,
  density real,
  created_at timestamp with time zone default now()
);

-- Create Volume Logs Table
CREATE TABLE volume_logs (
  id serial primary key,
  section_id integer references contractor_data(id),
  volume real,
  weight_ton real,
  frontal_area real,
  img_original text,
  img_grayscale text,
  img_blur text,
  img_mask text,
  timestamp timestamp with time zone default now()
);

-- Create Material Library Table
CREATE TABLE material_library (
  id serial primary key,
  name text not null,
  created_at timestamp with time zone default now()
);
